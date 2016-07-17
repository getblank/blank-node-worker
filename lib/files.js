let serviceRegistry = require("./serviceRegistry");
let request = require("request");
let fs = require("fs");

function get(storeName, _id, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    let fileStoreURL = serviceRegistry.getFileStoreURL();
    if (!fileStoreURL) {
        return cb(new Error("file store is not registered"));
    }
    let url = `${fileStoreURL}/${storeName}/${_id}`;
    request(url, function (err, response, body) {
        if (err) {
            return cb(err);
        }
        if (response.statusCode !== 200) {
            let err = new Error("http error");
            err.statusCode = response.statusCode;
            return cb(err);
        }
        cb(null, body);
    });
    return d;
}

function write(storeName, _id, fileName, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    let fileStoreURL = serviceRegistry.getFileStoreURL();
    if (!fileStoreURL) {
        return cb(new Error("file store is not registered"));
    }
    let url = `${fileStoreURL}/${storeName}/${_id}`;
    request
        .get(url)
        .on("error", cb)
        .pipe(fs.createWriteStream(fileName))
        .on("error", cb)
        .on("close", cb);
    return d;
}

module.exports.get = get;
module.exports.write = write;
