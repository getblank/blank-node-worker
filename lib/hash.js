const crypto = require("crypto");

const options = { N: 16384, r: 8, p: 1 };
const keyLen = 32;

const calc = (passwordBuffer, salt, cb) => {
    const d =
        typeof cb !== "function"
            ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
            : null;
    crypto.scrypt(passwordBuffer, salt, keyLen, options, (err, res) => {
        if (err != null) {
            return cb(err, null);
        }

        cb(null, res.toString("base64"));
    });

    return d;
};

const calcSync = (passwordBuffer, salt) => crypto.scryptSync(passwordBuffer, salt, keyLen, options).toString("base64");

module.exports = {
    calc,
    calcSync,
};
