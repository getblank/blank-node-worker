"use script";

let workerPublicModules = {
    "hash": "./hash",
};

module.exports.require = function(moduleName) {
    if (workerPublicModules.hasOwnProperty(moduleName) >= 0) {
        return require(workerPublicModules[moduleName]);
    }
};