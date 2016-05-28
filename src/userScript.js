import vm from "vm";
import domain from "domain";
import db from "./db";
import {require as userScriptRequire} from "./userScriptRequire";

var d = domain.create();
d.on("error", function (error) {
    console.log(error);
});

var initSandbox = {
    Promise: Promise,
    console: console,
    setTimeout: setTimeout,
    setInterval: setInterval,
    require: userScriptRequire,
    $db: db,
};
var context = vm.createContext(initSandbox);

module.exports.create = function (code, scriptName, args) {
    let fn;
    try {
        //Creating function in VM for non-anonymous stack traces
        fn = vm.runInContext(`(function (${(args || []).join(",")}) {
        ${code}
    })`, context, {"filename": scriptName, "lineOffset": 1});
    } catch (e) {
        console.log(e);
    }
    //Binding function to domain for handling async errors
    return d.bind(fn);
};

module.exports.run = function (fn) {
    let args = Array.prototype.slice.call(arguments, 1);
    return fn.apply(this, args);
};