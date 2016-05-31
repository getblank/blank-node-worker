"use strict";

import vm from "vm";
import domain from "domain";
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
};

function getSandbox() {
    let res = {
        Promise: Promise,
        Function: Function,
        console: console,
        setTimeout: setTimeout,
        setInterval: setInterval,
        require: _require,
        $db: db,
    };
    res.require.ensure = ensureModule;
    return res;
}

function registerModule(name, code, address, port) {
    if (name.endsWith(".js")) {
        name = name.slice(0, name.length - 3);
    }
    let m = externalModules[name] = Object.assign({}, externalModules[name], { "address": address, "port": port, "code": code });
    if (m.cached == null) {
        let sandbox = getSandbox();
        sandbox.module = {
            "exports": {},
        };
        sandbox.exports = sandbox.module.exports;
        vm.createContext(sandbox);
        vm.runInContext(m.code, sandbox);
        m.cached = sandbox.module.exports;
    }
    if (m.address) {
        m.cached.init(m.address, m.port);
    }
    checkWaiting();
}

function _require(moduleName) {
    if (internalModules.hasOwnProperty(moduleName)) {
        return require(internalModules[moduleName]);
    }
    if (externalModules.hasOwnProperty(moduleName)) {
        let m = externalModules[moduleName];
        return m.cached;
    }
    if (coreModules.indexOf(moduleName) >= 0) {
        return require(moduleName);
    }
    throw new Error(`Cannot find module ${moduleName}`);
}

function ensureModule(moduleName, cb) {
    if (!Array.isArray(moduleName)) {
        moduleName = [moduleName];
    }
    waiting.push({ "modules": moduleName, "cb": cb });
    checkWaiting();
}

function checkWaiting() {
    for (let j = waiting.length - 1; j >= 0; j--) {
        let waiter = waiting[j];
        for (let i = waiter.modules.length - 1; i >= 0; i--) {
            if (resolve(externalModules, waiter.modules[i])) {
                waiter.modules.splice(i, 1);
            }
        }
        if (waiter.modules.length < 1) {
            waiting.splice(j, 1);
            waiter.cb();
        }
    }
}

function resolve(modules, name) {
    if (name.endsWith(".js")) {
        name = name.slice(0, name.length - 3);
    }
    if (modules.hasOwnProperty(name)) {
        return modules[name];
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

    require() {
        return _require.apply(null, arguments);
    }
}

var userScript = new UserScript();
module.exports = userScript;