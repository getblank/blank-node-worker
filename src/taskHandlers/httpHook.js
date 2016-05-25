"use strict";

import TaskHandlerBase from "./TaskHandlerBase";
import configStore from "../configStore";
import {require as userScriptRequire} from "../userScriptRequire";

class ScheduledScript extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !Number.isInteger(args.hookIndex)) {
            cb(new Error("Invalid args."), null);
            return;
        }
        let taskDesc = configStore.getHttpHookDesc(storeName, args.hookIndex);
        if (taskDesc == null) {
            return cb(new Error("Http Hook not found"), null);
        }
        let res = taskDesc.script(this.db, userScriptRequire, args.request);
        if (res instanceof Promise) {
            return res.then(r => cb(null, r), e => cb (e, null));
        }
        cb(null, res);
    }
}
let scheduledScript = new ScheduledScript();
export default scheduledScript;
module.exports = scheduledScript;
