"use strict";

const taskqClient = require("./taskqClient");
const EventEmitter = require("events");
const configStore = require("./configStore");
const authUtils = require("./auth");
const $db = require("./db");
const { taskTypes, taskUris } = require("./const");
const UserError = require("./userError");

const emitter = new EventEmitter();

let wampClient = taskqClient.wampClient;

wampClient.onopen = () => {
    console.log("Connection to TaskQueue established");
    getTask();
};

const getTask = () => {
    if (wampClient.state !== 1) {
        console.warn("getTask called while no connection to TaskQueue");
        return;
    }

    console.debug("Wating for task...");
    wampClient.call(taskUris.get, (data, err) => {
        if (err) {
            console.warn(`Error while getting task: ${err}`);
            return getTask();
        }

        console.debug(`Task received: "${data.type}"`);
        runTask(data);
        getTask();
    });
};

const runTask = async task => {
    task._started = Date.now();
    try {
        validateTask(task);
    } catch (err) {
        sendTaskError(task || {}, err.message);
        return;
    }

    const storeDesc = await configStore.getStoreDesc(task.store);
    if (!storeDesc) {
        sendTaskError(task, "Store not found");
        return;
    }

    let user;
    try {
        user = await $db.getUser(task.userId);
        if (!user) {
            throw new Error("User not found");
        }
    } catch (err) {
        sendTaskError(task, "User not found");
        emitter.emit("taskUserNotFoundError", task);
        return;
    }

    if (!(await auth(task, user, storeDesc))) {
        sendTaskError(task, "Unauthorized");
        emitter.emit("taskAuthorizationError", task);
        return;
    }

    emitter.emit("taskWillRun", task);
    const handler = require("./taskHandlers/" + task.type);
    const taskCb = (err, res) => {
        if (err) {
            console.error(err);
            sendTaskError(task, err instanceof Error ? err.message : err);
        } else {
            sendTaskResult(task, res);
        }
        emitter.emit("taskDidRun", task);
    };

    try {
        handler.run(task.store, user, task.args, taskCb); // TODO: pass storeDesc into taskHandler instead of taskName
    } catch (err) {
        taskCb(err, null);
    }
};

const sendTaskError = (task, err) => {
    console.error(
        `${task.id || "?"} | ${task.store || "?"} | ${task.type || "?"} | ${Date.now() -
            task._started}ms | Task error:`,
        err
    );

    // SIC! to not stringify all requests when debug is turned off
    if (process.env.BLANK_DEBUG) {
        console.debug(
            `${task.id || "?"} | ${task.store || "?"} | ${task.type || "?"} | ${JSON.stringify(
                task.args
            )} | ${Date.now() - task._started}ms | Task error:`,
            err
        );
    }

    console.info("wampClient.state", wampClient.state);
    if (wampClient.state === 1) {
        let m = "500 Internal server error";
        if (err instanceof UserError) {
            m = err.message;
        }
        if (typeof err === "string") {
            m = err;
        }
        wampClient.call(taskUris.error, null, task.id || "UNKNOWN_TASK_ID", m);
    } else {
        //TODO - create send queue
    }
};

const sendTaskResult = (task, res) => {
    console.debug(`${task.id} | ${task.store} | ${task.type} | Task completed | ${Date.now() - task._started}ms`);

    // SIC! to not stringify all requests when debug is turned off
    if (process.env.BLANK_DEBUG) {
        console.debug(
            `${task.id} | ${task.store} | ${task.type} | ${JSON.stringify(task.args)} | Task completed | ${Date.now() -
                task._started}ms`
        );
    }

    if (wampClient.state === 1) {
        wampClient.call(taskUris.done, null, task.id, res);
    } else {
        //TODO - create send queue
    }
};

const validateTask = task => {
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
};

const auth = async (task, user, storeDesc) => {
    const permissions = await authUtils.computeAccess(storeDesc.access, user);
    if (permissions.indexOf("r") >= 0) {
        return true;
    }

    return false;
};

module.exports = {
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    test: {
        getUser: $db.getUser,
        runTask: runTask,
        validateTask: validateTask,
        setWamp(client) {
            wampClient = client;
            wampClient.state = 1;
        },
    },
};
