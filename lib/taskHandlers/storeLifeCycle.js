"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

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

        const eventDesc = configStore.getStoreEventHandler(storeName, args.event);
        if (eventDesc == null) {
            return cb(new Error("Handler not found"), null);
        }

        cb(null, eventDesc());
    }
}

const storeLifeCycle = new StoreLifeCycle();
module.exports = storeLifeCycle;
