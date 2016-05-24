"use script";

var Module = module.constructor;
var path = require("path");

let workerPublicModules = {
    "hash": "./hash",
};

let externalModules = {};

module.exports.require = function (moduleName) {
    if (workerPublicModules.hasOwnProperty(moduleName)) {
        return require(workerPublicModules[moduleName]);
    }
    if (externalModules.hasOwnProperty(moduleName)) {
        if (externalModules[moduleName].cached == null) {
            externalModules[moduleName].cached = __requireFromString(externalModules[moduleName].code, moduleName);
        }
        return externalModules[moduleName].cached;
    }
};

module.exports.register = function (name, code) {
    externalModules[name] = { "code": code };
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