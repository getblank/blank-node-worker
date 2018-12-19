"use strict";

const vm = require("vm");
const path = require("path");
const fs = require("fs-extra");
const JSZip = require("jszip");
const UserError = require("./userError");

const libDir = process.env.BLANK_DATA_DIR
    ? path.join(process.env.BLANK_DATA_DIR, "lib")
    : path.join(process.cwd(), "var", "lib");
const waiting = [];
const coreModules = [
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

const internalModules = {
    async: "async",
    clickhouse: "./clickhouse",
    email: "./email",
    "fast-json-patch": "fast-json-patch",
    fetch: "node-fetch",
    files: "./files",
    fs: "./fs",
    grpc: "grpc",
    handlebars: "handlebars",
    hash: "./hash",
    i18n: "./i18n",
    jszip: "jszip",
    moment: "moment",
    queue: "./queue",
    request: "request",
    serviceRegistry: "./serviceRegistry",
    sift: "sift",
    "utils/find": "utils/find",
    wamp: "wamp",
};

let externalModules = {};
let customSandbox = {};

function getSandbox(requireBasePath = ".") {
    let res = {
        Date: Date,
        Promise: Promise,
        Function: Function,
        Buffer: Buffer,
        UserError: UserError,
        console: console,
        process: process,
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
    externalModules[name] = Object.assign({}, externalModules[name], {
        address: address,
        port: port,
        code: code,
        name: name,
    });
    if (!dontCheckWaiting) {
        checkWaiting();
    }
}

function registerZip(buf, cb) {
    const d =
        typeof cb !== "function"
            ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
            : null;

    unregister(m => m.address == null);
    fs.emptyDir(libDir)
        .then(() => {
            return JSZip.loadAsync(buf);
        })
        .then(zip => {
            fs.emptyDir(libDir, err => {
                let promises = [];
                zip.forEach(function(relativePath, file) {
                    if ((!file.dir && path.extname(relativePath) === ".js") || path.extname(relativePath) === ".json") {
                        promises.push(
                            file.async("string").then(res => {
                                if (path.basename(relativePath) === "package.json") {
                                    try {
                                        const p = JSON.parse(res);
                                        if (p.main) {
                                            let moduleName = path.dirname(relativePath);
                                            let mainPath = path.join(moduleName, p.main);
                                            console.debug(
                                                `Extracted package.json: ${relativePath}. Module: ${moduleName}. Main path: ${mainPath}`
                                            );
                                            registerModule(
                                                moduleName,
                                                `module.exports = require("${mainPath}")`,
                                                null,
                                                null,
                                                true
                                            );
                                        }
                                    } catch (e) {
                                        console.debug("Invalid package.json in:", relativePath);
                                    }
                                } else {
                                    console.debug(
                                        "Extracted: ",
                                        relativePath,
                                        " Code:",
                                        res.slice(0, 10).replace(/(\r?\n)/g),
                                        "..."
                                    );
                                    registerModule(relativePath, res, null, null, true);
                                }

                                const filePath = path.join(libDir, relativePath);
                                return fs
                                    .ensureDir(path.dirname(filePath))
                                    .then(() => {
                                        return fs.writeFile(filePath, res);
                                    })
                                    .then(() => {
                                        console.debug(`[registerZip] saved file ${filePath}`);
                                    })
                                    .catch(err => {
                                        console.error(`[registerZip] saving file ${filePath} error`, err);
                                    });
                            })
                        );
                    }
                });

                Promise.all(promises)
                    .then(() => {
                        console.debug(`Modules loaded from zip: ${promises.length}`);
                        checkWaiting();
                        cb(null);
                    })
                    .catch(err => {
                        console.debug("Error while loading modules from zip:", err);
                        cb(err);
                    });
            });
        })
        .catch(err => {
            cb(err);
        });

    return d;
}

function userRequire(basePath, moduleName) {
    if (internalModules.hasOwnProperty(moduleName)) {
        return require(internalModules[moduleName]);
    }
    if (coreModules.indexOf(moduleName) >= 0) {
        return require(moduleName);
    }
    let m = resolve(basePath, moduleName);
    if (m) {
        loadModule(m);
        return m.cached;
    }

    return require(moduleName);
}

function ensureModule(basePath, waitFor, cb) {
    let d =
        typeof cb !== "function"
            ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
            : null;
    if (!Array.isArray(waitFor)) {
        waitFor = [waitFor];
    }
    waiting.push({ modules: waitFor, basePath: basePath, cb: cb });
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
    //If path begins with './', join it with base path
    if (/^\.\//.test(moduleName)) {
        moduleName = path.join(basePath, moduleName).replace(/^\.\//, "");
    }

    if (externalModules.hasOwnProperty(moduleName)) {
        return externalModules[moduleName];
    }

    if (externalModules.hasOwnProperty(moduleName + ".js")) {
        return externalModules[moduleName + ".js"];
    }

    const nameWithIndex = path.normalize(moduleName + "/index.js");
    if (externalModules.hasOwnProperty(nameWithIndex)) {
        return externalModules[nameWithIndex];
    }

    return null;
}

function loadModule(m) {
    if (m.cached == null) {
        let sandbox = getSandbox(path.dirname(m.name));
        sandbox.module = {
            exports: {},
        };
        sandbox.exports = sandbox.module.exports;
        vm.createContext(sandbox);
        vm.runInContext(m.code, sandbox, { filename: m.name });
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
            fn = vm.runInContext(
                `(${sync ? "" : "async "}function (${(args || []).join(",")}) {
                ${code}
            })`,
                this.context,
                { filename: scriptName, lineOffset: 1 }
            );
        } catch (err) {
            throw new Error(`can't create user script ${scriptName}, error: ${err}`);
        }

        return fn;
    }

    run(fn) {
        let args = Array.prototype.slice.call(arguments, 1);
        return fn.apply(null, args);
    }

    require(moduleName) {
        return userRequire(".", moduleName);
    }

    requireLib(moduleName) {
        return require(path.join(libDir, moduleName));
    }
}

process.on("exit", code => {
    fs.emptyDirSync(libDir);
    console.info(`Worker is about to exit with code: ${code}`);
});

var userScript = new UserScript();
module.exports = userScript;
