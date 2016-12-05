"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");

class ScheduledScript extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !Number.isInteger(args.taskIndex)) {
            cb(new Error("Invalid args."), null);
            return;
        }
        let taskDesc = configStore.getTaskDesc(storeName, args.taskIndex);
        if (taskDesc == null) {
            return cb(new Error("Task not found"), null);
        }
        taskDesc.script().then(r => cb(null, r), e => cb(e, null));
    }
}
let scheduledScript = new ScheduledScript();
module.exports = scheduledScript;
