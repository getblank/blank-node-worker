"use strict";

let _serviceRegistry = {};

function update(data) {
    _serviceRegistry = data || {};
}

function getTaskQueueAddress() {
    if (!_serviceRegistry.taskQueue || !_serviceRegistry.taskQueue[0]) {
        return null;
    }
    return (
        _serviceRegistry.taskQueue[0].address +
        (_serviceRegistry.taskQueue[0].port ? ":" + _serviceRegistry.taskQueue[0].port : "")
    );
}

function getQueueAddress() {
    if (!_serviceRegistry.queue || !_serviceRegistry.queue[0]) {
        return null;
    }
    return (
        _serviceRegistry.queue[0].address + (_serviceRegistry.queue[0].port ? ":" + _serviceRegistry.queue[0].port : "")
    );
}

function getFileStoreURL() {
    return _serviceRegistry.fileStoreURL;
}

const FSAddress = process.env.BLANK_FILE_STORE_HOST || "127.0.0.1";
const FSPort = process.env.BLANK_FILE_STORE_PORT || "8082";
_serviceRegistry.fileStoreURL = `${FSAddress}:${FSPort}/`;

module.exports.update = update;
module.exports.getTaskQueueAddress = getTaskQueueAddress;
module.exports.getQueueAddress = getQueueAddress;
module.exports.getFileStoreURL = getFileStoreURL;
