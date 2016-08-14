"use strict";

let vm = require("vm");
let domain = require("domain");
let path = require("path");
let JSZip = require("jszip");
let UserError = require("./userError");
let customSandbox = {};

let d = domain.create();
d.on("error", function (error) {
    console.log("User script error:", error);
});
let waiting = [];
let coreModules = [
    "assert",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "dns",
    "domain",
    "events",
    "excel-export",
    "exceljs",
    // "fs",
    "http",
    "https",
    "module",
    "net",
    "os",
    "path",
    "process",
    "punycode",
    "querystring",
    "readline",
    "repl",
    "stream",
    "string_decoder",
    "timers",
    "tls",
    "tty",
    "unstream",
    "url",
    "util",
    // "v8",
    "vm",
    "zlib",
];
let externalModules = {};
let internalModules = {
    "async": "async",
    "clickhouse": "./clickhouse",
    "email": "./email",
    "files": "./files",
    "fs": "./fs",
    "handlebars": "handlebars",
    "hash": "./hash",
    "i18n": "./i18n",
    "moment": "moment",
    "queue": "./queue",
    "request": "request",
    "serviceRegistry": "./serviceRegistry",
    "sift": "sift",
    "utils/find": "utils/find",
    "wamp": "wamp",
};

function getSandbox(requireBasePath = ".") {
    let res = {
        Date: Date,
        Promise: Promise,
        Function: Function,
        Buffer: Buffer,
        UserError: UserError,
        console: console,
        setTimeout: setTimeout,
        setInterval: setInterval,
        require: userRequire.bind(this, requireBasePath),
    };
    Object.assign(res, customSandbox);
    res.require.ensure = ensureModule.bind(this, requireBasePath);
    return res;
}

function unregister(condition) {
    if (typeof condition === "function") {
        for (let mName of Object.keys(externalModules)) {
            if (condition(externalModules[mName])) {
                delete externalModules[mName];
            }
        }
    } else {
        externalModules = {};
    }
}

function registerModule(name, code, address, port, dontCheckWaiting) {
    externalModules[name] = Object.assign({}, externalModules[name], { "address": address, "port": port, "code": code, "name": name });
    if (!dontCheckWaiting) {
        checkWaiting();
    }
}

function registerZip(buf, cb) {
    unregister(m => m.address == null);
    JSZip.loadAsync(buf).then(function (zip) {
        let promises = [];
        zip.forEach(function (relativePath, file) {
            if (!file.dir && (path.extname(relativePath) === ".js") || path.extname(relativePath) === ".json") {
                promises.push(file.async("string").then((r) => {
                    if (path.basename(relativePath) === "package.json") {
                        try {
                            let p = JSON.parse(r);
                            if (p.main) {
                                let moduleName = path.dirname(relativePath);
                                let mainPath = path.join(moduleName, p.main);
                                console.log(`Extracted package.json: ${relativePath}. Module: ${moduleName}. Main path: ${mainPath}`);
                                registerModule(moduleName, `module.exports = require("${mainPath}")`, null, null, true);
                            }
                        }
                        catch (e) {
                            console.log("Invalid package.json in:", relativePath);
                        }
                    } else {
                        console.log("Extracted: ", relativePath, " Code:", r.slice(0, 10).replace(/(\r?\n)/g), "...");
                        registerModule(relativePath, r, null, null, true);
                    }
                    return Promise.resolve();
                }));
            }
        });
        Promise.all(promises).then(() => {
            console.log(`Modules loaded from zip: ${promises.length}`);
            checkWaiting();
            cb(null);
        }).catch((err) => {
            console.log("Error while loading modules from zip:", err);
            cb(err);
        });
    });
}

function userRequire(basePath, moduleName) {
    if (internalModules.hasOwnProperty(moduleName)) {
        return require(internalModules[moduleName]);
    }
    if (coreModules.indexOf(moduleName) >= 0) {
        return require(moduleName);
    }
    let m = resolve(basePath, moduleName);
    if (m != null) {
        loadModule(m);
        return m.cached;
    }
    let errMessage = `Cannot find module ${moduleName}`;
    console.error(errMessage);
    throw new Error(errMessage);
}

function ensureModule(basePath, waitFor, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (!Array.isArray(waitFor)) {
        waitFor = [waitFor];
    }
    waiting.push({ "modules": waitFor, "basePath": basePath, "cb": cb });
    checkWaiting();
    return d;
}

function checkWaiting() {
    for (let j = waiting.length - 1; j >= 0; j--) {
        let waiter = waiting[j];
        for (let i = waiter.modules.length - 1; i >= 0; i--) {
            let m = resolve(waiter.basePath, waiter.modules[i]);
            if (m != null) {
                loadModule(m);
                waiter.modules.splice(i, 1);
            }
        }
        if (waiter.modules.length < 1) {
            waiting.splice(j, 1);
            waiter.cb();
        }
    }
}

function resolve(basePath, moduleName) {
    //If path begins with '/', '../', or './', join it with base path
    if (/^\.{0,2}\//.test(moduleName)) {
        moduleName = path.join(basePath, moduleName).replace(/^\.{0,2}\//, "");
    }

    if (externalModules.hasOwnProperty(moduleName)) {
        return externalModules[moduleName];
    }
    if (externalModules.hasOwnProperty(moduleName + ".js")) {
        return externalModules[moduleName + ".js"];
    }
    let nameWithIndex = path.normalize(moduleName + "/index.js");
    if (externalModules.hasOwnProperty(nameWithIndex)) {
        return externalModules[nameWithIndex];
    }
    return null;
}

function loadModule(m) {
    if (m.cached == null) {
        let sandbox = getSandbox(path.dirname(m.name));
        sandbox.module = {
            "exports": {},
        };
        sandbox.exports = sandbox.module.exports;
        vm.createContext(sandbox);
        d.run(() => {
            vm.runInContext(m.code, sandbox, { "filename": m.name });
        });
        m.cached = sandbox.module.exports;
        if (m.address) {
            m.cached.init(m.address, m.port);
        }
    }
}

class UserScript {
    constructor() {
        this.context = vm.createContext(getSandbox());
        this.require.register = registerModule;
        this.require.registerZip = registerZip;
        this.require.unregister = unregister;
        this.setup = this.setup.bind(this);
    }

    setup(sandbox) {
        customSandbox = sandbox;
        this.context = vm.createContext(getSandbox());
    }

    create(code, scriptName, args, sync) {
        let fn;
        try {
            //Creating function in VM for non-anonymous stack traces
            fn = vm.runInContext(`(function (${(args || []).join(",")}) {
            ${code}
        })`, this.context, { "filename": scriptName, "lineOffset": 1 });
        } catch (e) {
            console.log(e);
        }
        if (sync) {
            //Binding function to domain for handling async errors
            return d.bind(fn);
        } else {
            return (arg1, arg2, arg3, arg4, arg5) => {
                return new Promise((resolve, reject) => {
                    let log = function (error) {
                        console.error(`User script error: ${scriptName}: ${error}`);
                        reject(error);
                    };
                    let _d = domain.create();
                    _d.on("error", log);
                    _d.run(() => {
                        var res;
                        try {
                            res = fn(arg1, arg2, arg3, arg4, arg5);
                        } catch (e) { log(e) }

                        if (res instanceof Promise) {
                            res.then(resolve, reject);
                        } else {
                            resolve(res);
                        }
                    });
                });
            };
        }
    }

    run(fn) {
        let args = Array.prototype.slice.call(arguments, 1);
        return fn.apply(null, args);
    }

    require(moduleName) {
        return userRequire(".", moduleName);
    }
}

var userScript = new UserScript();
module.exports = userScript;