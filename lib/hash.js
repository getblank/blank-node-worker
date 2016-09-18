"use strict";

var scrypt = require("scrypt");

module.exports.calc = function (passwordBuffer, salt, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
    scrypt.hash(passwordBuffer, { "N": 16384, "r": 8, "p": 1 }, 32, salt, function (e, d) {
        if (e != null) {
            cb(e, null);
        } else {
            cb(null, d.toString("base64"));
        }
    });
    return d;
};

module.exports.calcSync = function (passwordBuffer, salt) {
    return scrypt.hashSync(passwordBuffer, { "N": 16384, "r": 8, "p": 1 }, 32, salt).toString("base64");
};