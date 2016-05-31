"use script";

var Module = module.constructor;
var path = require("path");

let workerPublicModules = {
    "hash": "./hash",
    "i18n": "./i18n",
};

let externalModules = {};
let networkModules = null;

module.exports.isReady = function () {
    return networkModules != null;
};

module.exports.setup = function (libs) {
    networkModules = libs;
};

module.exports.require = function (moduleName) {
    if (workerPublicModules.hasOwnProperty(moduleName)) {
        return require(workerPublicModules[moduleName]);
    }
    if (externalModules.hasOwnProperty(moduleName)) {
        let m = externalModules[moduleName];
        return m.cached;
    }
    let _moduleName = __resolveNetworkModuleName(moduleName);
    if (networkModules != null && networkModules.hasOwnProperty(_moduleName)) {
        if (typeof networkModules[_moduleName] === "string") {
            networkModules[_moduleName] = __requireFromString(networkModules[_moduleName], _moduleName);
        }
        return networkModules[_moduleName];
    }
    return require(moduleName);
};

module.exports.register = function (name, address, port, code) {
    let m = externalModules[name] = Object.assign({}, externalModules[name], { "address": address, "port": port, "code": code });
    if (m.cached == null) {
        m.cached = __requireFromString(m.code, name);
    }
    m.cached.init(m.address, m.port);
};

function __resolveNetworkModuleName(moduleName) {
    moduleName = (moduleName.slice(moduleName.length - 3) === ".js" ? moduleName : moduleName + ".js");
    if (moduleName.indexOf("./" === 0)) {
        moduleName = moduleName.replace("./", "");
    }
    return moduleName;
}

function __requireFromString(code, filename = "", opts = {}) {
    if (typeof filename === "object") {
        opts = filename;
        filename = undefined;
    }

    opts.appendPaths = opts.appendPaths || [];
    opts.prependPaths = opts.prependPaths || [];

    if (typeof code !== "string") {
        throw new Error("code must be a string, not " + typeof code);
    }

    var paths = Module._nodeModulePaths(path.dirname(filename));

    var m = new Module(filename, module.parent);
    m.filename = filename;
    m.paths = [].concat(opts.prependPaths).concat(paths).concat(opts.appendPaths);
    m._compile(code, filename);

    return m.exports;
}