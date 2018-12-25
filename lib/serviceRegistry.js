"use strict";

let _serviceRegistry = {};

function update(data) {
    _serviceRegistry = data || {};
}

function getPBX() {
    return (_serviceRegistry.pbx && _serviceRegistry.pbx[0]) || null;
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
    if (!_serviceRegistry.fileStore || !_serviceRegistry.fileStore[0]) {
        // return null;
        _serviceRegistry.fileStore = [{ address: "http://127.0.0.1", port: "8082" }];
    }
    return _serviceRegistry.fileStore[0].address + ":" + _serviceRegistry.fileStore[0].port + "/";
}

module.exports.update = update;
module.exports.getPBX = getPBX;
module.exports.getTaskQueueAddress = getTaskQueueAddress;
module.exports.getQueueAddress = getQueueAddress;
module.exports.getFileStoreURL = getFileStoreURL;
