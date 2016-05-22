"use strict";

import scrypt from "scrypt";

module.exports.calc = function (passwordBuffer, salt, cb) {
    scrypt.hash(passwordBuffer, { "N": 16384, "r": 8, "p": 1 }, 32, salt, function (e, d) {
        if (e != null) {
            cb(e, null);
        } else {
            cb(null, d.toString("base64"));
        }
    });
};