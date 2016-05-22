"use script";

let workerPublicModules = ["hash"];

module.exports = function(moduleName) {
    if (workerPublicModules.indexOf(moduleName) >= 0) {
        return require(moduleName);
    }
};