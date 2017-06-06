"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class ScheduledScript extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !Number.isInteger(args.taskIndex)) {
            cb(new Error("Invalid args."), null);
            return;
        }

        const taskDesc = configStore.getTaskDesc(storeName, args.taskIndex);
        if (taskDesc == null) {
            return cb(new Error("Task not found"), null);
        }

        taskDesc.script().then(res => cb(null, res), err => cb(err, null));
    }
}

const scheduledScript = new ScheduledScript();
module.exports = scheduledScript;
