"use strict";

import TaskHandlerBase from "./TaskHandlerBase";
import configStore from "../configStore";

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
        cb(null, taskDesc.script(this.db));
    }
}
let scheduledScript = new ScheduledScript();
export default scheduledScript;
module.exports = scheduledScript;
