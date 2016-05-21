"use strict";

import WampClient from "wamp";
import EventEmitter from "events";
import configStore from "./configStore";
import authUtils from "./auth";
import db from "./db";
import {taskTypes, taskUris} from "./const";

let wampClient = new WampClient(true, true),
    _connected = false,
    // _busy = false,
    _uri = null;

let emitter = new EventEmitter();
module.exports.on = emitter.on.bind(emitter);
module.exports.removeListener = emitter.removeListener.bind(emitter);

wampClient.onopen = function () {
    _connected = true;
    getTask();
};
wampClient.onclose = function () {
    _connected = false;
};

module.exports.setup = function (uri) {
    if (uri != _uri) {
        _uri = uri;
        if (uri) {
            wampClient.close();
            setTimeout(() => {
                wampClient.open(uri);
            });
        }
    }
    getTask();
};

module.exports.test = {
    "setWamp": function (client) {
        wampClient = client;
        _connected = true;
    },
    "validateTask": validateTask,
    "runTask": runTask,
    "getUser": getUser,
};

function getTask() {
    if (!_connected || !configStore.isReady()) { // || _busy) {
        return;
    }
    // _busy = true;
    wampClient.call(taskUris.get, (data, err) => {
        if (err == null) {
            runTask(data);
        }
        // _busy = false;
        getTask();
    });
}

function runTask(task) {
    try {
        validateTask(task);
    } catch (e) {
        sendTaskError(task || {}, e.message);
        return;
    }
    let storeDesc = configStore.getStoreDesc(task.store);
    if (storeDesc == null) {
        sendTaskError(task, "Store not found");
        return;
    }
    getUser(task.userId, (error, user) => {
        if (!auth(task, user, storeDesc)) {
            sendTaskError(task, "Unauthorized");
            emitter.emit("taskAuthorizationError", task);
            return;
        }
        emitter.emit("taskWillRun", task);
        let handler = require("./taskHandlers/" + task.type);
        let taskCb = (e, d) => {
            if (e != null) {
                sendTaskError(task, e.message);
            } else {
                sendTaskResult(task, d);
            }
            emitter.emit("taskDidRun", task);
        };
        try {
            handler.run(task.store, user, task.args, taskCb);
        } catch (e) {
            taskCb(e, null);
        }
    });
}

function sendTaskError(task, e) {
    if (_connected) {
        wampClient.call(taskUris.error, null, task.id || "UNKNOWN_TASK_ID", e);
    } else {
        //TODO - create send queue
    }
}

function sendTaskResult(task, d) {
    if (_connected) {
        wampClient.call(taskUris.done, null, task.id, d);
    } else {
        //TODO - create send queue
    }
}

function validateTask(task) {
    if (task == null || typeof task !== "object" || task.id == null) {
        throw new Error("Invalid task");
    }
    if (!task.store) {
        task.store = "_";
    }
    if (!task.userId) {
        task.userId = "guest";
    }
    if (!task.type || !taskTypes[task.type]) {
        throw new Error("Task type not supported");
    }
}

function auth(task, user, storeDesc) {
    let permissions = authUtils.computeAccess(storeDesc.access, user);
    if (permissions.indexOf("r") >= 0) {
        return true;
    }
    return false;
}

function getUser(userId, cb) {
    setTimeout(() => {
        switch (userId) {
            case "root":
                cb(null, {
                    "_id": userId,
                    "roles": ["root"],
                });
                break;
            case "guest":
                cb(null, {
                    "_id": userId,
                    "roles": ["guest"],
                });
                break;
            default:
                cb(null, {
                    "_id": userId,
                    "roles": ["root"],
                });
                break;
        }
    });
}