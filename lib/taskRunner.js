"use strict";

var taskqClient = require("./taskqClient");
var EventEmitter = require("events");
var configStore = require("./configStore");
var authUtils = require("./auth");
var $db = require("./db");
var { taskTypes, taskUris } = require("./const");
var UserError = require("./userError");

let wampClient = taskqClient.wampClient;

let emitter = new EventEmitter();
module.exports.on = emitter.on.bind(emitter);
module.exports.removeListener = emitter.removeListener.bind(emitter);

wampClient.onopen = function () {
    console.log("Connection to TaskQueue established");
    getTask();
};

module.exports.test = {
    setWamp: function (client) {
        wampClient = client;
        wampClient.state = 1;
    },
    validateTask: validateTask,
    runTask: runTask,
    getUser: $db.getUser,
};

function getTask() {
    if (wampClient.state !== 1) {
        console.warn("getTask called while no connection to TaskQueue");
        return;
    }
    console.debug("Wating for task...");
    wampClient.call(taskUris.get, (data, err) => {
        if (err == null) {
            console.debug(`Task received: "${data.type}"`);
            runTask(data);
        } else {
            console.warn(`Error while getting task: ${err}`);
        }
        getTask();
    });
}

function runTask(task) {
    task._started = Date.now();
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

    $db.getUser(task.userId, (error, user) => {
        if (user == null) {
            sendTaskError(task, "User not found");
            emitter.emit("taskUserNotFoundError", task);
            return;
        }
        if (!auth(task, user, storeDesc)) {
            sendTaskError(task, "Unauthorized");
            emitter.emit("taskAuthorizationError", task);
            return;
        }
        emitter.emit("taskWillRun", task);
        let handler = require("./taskHandlers/" + task.type);
        let taskCb = (e, d) => {
            if (e != null) {
                sendTaskError(task, e instanceof Error ? e.message : e);
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
    console.error(`${task.id || "?"} | ${task.store || "?"} | ${task.type || "?"} | ${Date.now() - task._started}ms | Task error:`, e);

    // SIC! to not stringify all requests when debug is turned off
    if (process.env.BLANK_DEBUG) {
        console.debug(`${task.id || "?"} | ${task.store || "?"} | ${task.type || "?"} | ${JSON.stringify(task.args)} | ${Date.now() - task._started}ms | Task error:`, e);
    }

    if (wampClient.state === 1) {
        let m = "500 Internal server error";
        if (e instanceof UserError) {
            m = e.message;
        }
        if (typeof e === "string") {
            m = e;
        }
        wampClient.call(taskUris.error, null, task.id || "UNKNOWN_TASK_ID", m);
    } else {
        //TODO - create send queue
    }
}

function sendTaskResult(task, d) {
    console.debug(`${task.id} | ${task.store} | ${task.type} | Task completed | ${Date.now() - task._started}ms`);

    // SIC! to not stringify all requests when debug is turned off
    if (process.env.BLANK_DEBUG) {
        console.debug(`${task.id} | ${task.store} | ${task.type} | ${JSON.stringify(task.args)} | Task completed | ${Date.now() - task._started}ms`);
    }

    if (wampClient.state === 1) {
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
        throw new Error(`Task type '${task.type}' is not supported`);
    }
}

function auth(task, user, storeDesc) {
    let permissions = authUtils.computeAccess(storeDesc.access, user);
    if (permissions.indexOf("r") >= 0) {
        return true;
    }
    return false;
}
