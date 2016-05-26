"use script";

var Module = module.constructor;
var path = require("path");

let workerPublicModules = {
    "hash": "./hash",
    "i18n": "./i18n",
};

let externalModules = {};

module.exports.require = function (moduleName) {
    if (workerPublicModules.hasOwnProperty(moduleName)) {
        return require(workerPublicModules[moduleName]);
    }
    if (externalModules.hasOwnProperty(moduleName)) {
        let m = externalModules[moduleName];
        return m.cached;
    }
};

module.exports.register = function (name, address, port, code) {
    let m = externalModules[name] = Object.assign({}, externalModules[name], { "address": address, "port": port, "code": code });
    if (m.cached == null) {
        m.cached = __requireFromString(m.code, name);
    }
    m.cached.init(m.address, m.port);
};

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