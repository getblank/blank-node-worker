"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class ScheduledScript extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (args == null || !Number.isInteger(args.taskIndex)) {
            throw new Error("Invalid args.");
        }

        const taskDesc = configStore.getTaskDesc(storeName, args.taskIndex);
        if (taskDesc == null) {
            throw new Error("Task not found");
        }

        return taskDesc.script();
    }
}

const scheduledScript = new ScheduledScript();
module.exports = scheduledScript;
