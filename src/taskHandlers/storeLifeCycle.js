"use strict";

import TaskHandlerBase from "./TaskHandlerBase";
import configStore from "../configStore";
import userScriptRequire from "../userScriptRequire";

class StoreLifeCycle extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (user._id !== "system") {
            cb(new Error("Access denied"), null);
            return;
        }
        if (args == null || !args.event) {
            cb(new Error("Invalid args"), null);
            return;
        }
        let eventDesc = configStore.getStoreEventHandler(storeName, args.event);
        if (eventDesc == null) {
            return cb(new Error("Handler not found"), null);
        }
        cb(null, eventDesc(this.db, userScriptRequire));
    }
}
let storeLifeCycle = new StoreLifeCycle();
export default storeLifeCycle;
module.exports = storeLifeCycle;
