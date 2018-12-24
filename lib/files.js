const serviceRegistry = require("./serviceRegistry");
const request = require("request");
const url = require("url");
const http = require("http");
const fs = require("fs");

function del(storeName, _id, cb) {
    const d =
        typeof cb !== "function"
            ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
            : null;

    const uri = url.parse(getURL(storeName, _id));
    const req = http.request(
        {
            protocol: uri.protocol,
            hostname: uri.hostname,
            port: uri.port,
            path: uri.path,
            method: "DELETE",
        },
        res => {
            if (res.statusCode === 200) {
                return cb();
            }

            const err = new Error("HTTP error");
            err.statusCode = res.statusCode;
            return cb(err);
        }
    );

    req.on("error", cb);
    req.end();

    return d;
}

function get(storeName, _id, cb) {
    let d =
        typeof cb !== "function"
            ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
            : null;

    const uri = getURL(storeName, _id);
    http.get(uri, res => {
        if (res.statusCode !== 200) {
            let err = new Error("HTTP error");
            err.statusCode = res.statusCode;
            return cb(err);
        }
        var data = [];
        res.on("data", function(chunk) {
            data.push(chunk);
        });
        res.on("end", function() {
            var buf = Buffer.concat(data);
            cb(null, buf);
        });
    }).on("error", e => {
        cb(new Error("Network error"));
    });

    return d;
}

function getURL(storeName, _id) {
    const fileStoreURL = serviceRegistry.getFileStoreURL();
    if (!fileStoreURL) {
        throw new Error("file store is not registered");
    }

    return url.resolve(fileStoreURL, `${storeName}/${_id}/`);
}

function save(storeName, file, fileBuffer, cb) {
    const d =
        typeof cb !== "function"
            ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
            : null;

    const uri = url.parse(getURL(storeName, _id));
    const req = http.request(
        {
            protocol: uri.protocol,
            hostname: uri.hostname,
            port: uri.port,
            path: uri.path,
            headers: {
                "file-name": file.name,
            },
            method: "POST",
        },
        res => {
            if (res.statusCode === 200) {
                return cb();
            }

            const err = new Error("HTTP error");
            err.statusCode = res.statusCode;
            return cb(err);
        }
    );

    req.on("error", cb);
    req.write(fileBuffer);
    req.end();

    return d;
}

function write(storeName, _id, fileName, cb) {
    let d =
        typeof cb !== "function"
            ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
            : null;

    const uri = getURL(storeName, _id);
    request
        .get(uri)
        .on("error", cb)
        .pipe(fs.createWriteStream(fileName))
        .on("error", cb)
        .on("close", cb);

    return d;
}

module.exports = {
    del,
    get,
    getURL,
    save,
    write,
};
