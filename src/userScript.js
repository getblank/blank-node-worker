"use strict";

import vm from "vm";
import domain from "domain";
import path from "path";
import db from "./db";

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
    "fs",
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
    "url",
    "util",
    "v8",
    "vm",
    "zlib",
];
let externalModules = {};
let internalModules = {
    "hash": "./hash",
    "i18n": "./i18n",
    "email": "./email",
};

function getSandbox(requireBasePath = ".") {
    let res = {
        Promise: Promise,
        Function: Function,
        console: console,
        setTimeout: setTimeout,
        setInterval: setInterval,
        require: userRequire.bind(this, requireBasePath),
        $db: db,
    };
    res.require.ensure = ensureModule.bind(this, requireBasePath);
    return res;
}

function registerModule(name, code, address, port) {
    externalModules[name] = Object.assign({}, externalModules[name], { "address": address, "port": port, "code": code, "name": name });
    checkWaiting();
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
    throw new Error(`Cannot find module ${moduleName}`);
}

function ensureModule(basePath, waitFor, cb) {
    if (!Array.isArray(waitFor)) {
        waitFor = [waitFor];
    }
    waiting.push({ "modules": waitFor, "basePath": basePath, "cb": cb });
    checkWaiting();
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
        vm.runInContext(m.code, sandbox);
        m.cached = sandbox.module.exports;
        if (m.address) {
            m.cached.init(m.address, m.port);
        }
    }
}

class UserScript {
    constructor() {
        this.d = domain.create();
        this.d.on("error", function (error) {
            console.log(error);
        });
        this.context = vm.createContext(getSandbox());
        this.require.register = registerModule;
    }

    create(code, scriptName, args) {
        let fn;
        try {
            //Creating function in VM for non-anonymous stack traces
            fn = vm.runInContext(`(function (${(args || []).join(",")}) {
            ${code}
        })`, this.context, { "filename": scriptName, "lineOffset": 1 });
        } catch (e) {
            console.log(e);
        }
        //Binding function to domain for handling async errors
        return this.d.bind(fn);
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