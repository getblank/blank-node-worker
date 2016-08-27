const serviceRegistry = require("./serviceRegistry");
const request = require("request");
const url = require("url");
const http = require("http");
const fs = require("fs");

function get(storeName, _id, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    let fileStoreURL = serviceRegistry.getFileStoreURL();
    if (!fileStoreURL) {
        return cb(new Error("file store is not registered"));
    }
    let uri = url.resolve(fileStoreURL, `${storeName}/${_id}/`);
    http.get(uri, (res) => {
        if (res.statusCode !== 200) {
            let err = new Error("HTTP error");
            err.statusCode = res.statusCode;
            return cb(err);
        }
        var data = [], dataLen = 0;
        res.on("data", function (chunk) {
            data.push(chunk);
            dataLen += chunk.length;
        });
        res.on("end", function () {
            var buf = Buffer.concat(data);
            cb(null, buf);
        });
    }).on("error", (e) => {
        cb(new Error("Network error"));
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
