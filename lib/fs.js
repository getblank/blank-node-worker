"use strict";

let fs = require("fs");
let JSZip = require("jszip");
let zip;

fs.readLib = (path) => {
    if (!zip) {
        return Promise.reject(new Error(`file "${path}" not found`));
    }
    let file = zip.file(path);
    if (!file) {
        return Promise.reject(new Error(`file "${path}" not found`));
    }
    return file.async("string");
};

fs._registerZip = (buf) => {
    zip = new JSZip();
    zip.loadAsync(buf);
};

module.exports = fs;