"use strict";

let calc, calcSync;

try {
    const scrypt = require("scrypt");

    calc = (passwordBuffer, salt, cb) => {
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        scrypt.hash(passwordBuffer, { N: 16384, r: 8, p: 1 }, 32, salt, function (err, res) {
            if (err != null) {
                return cb(err, null);
            }

            cb(null, res.toString("base64"));
        });
        return d;
    };

    calcSync = (passwordBuffer, salt) => {
        return scrypt.hashSync(passwordBuffer, { N: 16384, r: 8, p: 1 }, 32, salt).toString("base64");
    };

} catch (err) {
    console.info("Native scrypt not found, pure JS version will used");
    const jsScrypt = require("js-scrypt");
    const options = {
        cost: 16384,
        blockSize: 8,
        parallel: 1,
        size: 32,
    };

    calc = (passwordBuffer, salt, cb) => {
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        jsScrypt.hash(passwordBuffer, salt, options, (err, res) => {
            if (err) {
                return cb(err);
            }

            cb(null, res.toString("base64"));
        });
        return d;
    };

    calcSync = (passwordBuffer, salt) => {
        return jsScrypt.hashSync(passwordBuffer, salt, options).toString("base64");
    };
}

module.exports = {
    calc,
    calcSync,
};
