"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");
var {dbErrors} = require("../const");

class PerformAction extends TaskHandlerBase {
    __run(cb, actionDesc, user, data, item) {
        if (actionDesc.hidden(user, item)) {
            cb(new Error("Action is hidden"), null);
            return;
        }
        if (actionDesc.disabled(user, item)) {
            cb(new Error("Action is disabled"), null);
            return;
        }
        let res = actionDesc.script(user, item, data);
        if (res instanceof Promise) {
            return res.then(r => cb(null, r), e => cb(e, null));
        }
        cb(null, res);
    }

    run(storeName, user, args, cb) {
        if (args == null || !args.actionId) {
            cb(new Error("Invalid args."), null);
            return;
        }
        let actionDesc;
        try {
            actionDesc = configStore.getActionDesc(storeName, args.actionId);
        } catch (e) {
            cb(new Error("Action not found"), null);
            return;
        }
        if (!actionDesc.storeAction && !args.itemId) {
            cb(new Error("Invalid args: no itemId provided"), null);
            return;
        }
        if (actionDesc.storeAction) {
            this.__run(cb, actionDesc, user, args.data);
            return;
        }
        let storeDesc = configStore.getStoreDesc(storeName, user), createBaseIfNotFound = false;
        if (storeDesc.type === "single" || storeDesc.display === "single") {
            createBaseIfNotFound = true;
        }
        this.db.get(args.itemId, storeName, (e, item) => {
            if (e) {
                if (createBaseIfNotFound && (e.message === dbErrors.itemNotFound || e.message === dbErrors.storeNotFound)) {
                    item = configStore.getBaseItem(storeName, user);
                } else {
                    console.log(e);
                    cb(new Error("Item load error"), null);
                    return;
                }
            }
            this.__run(cb, actionDesc, user, args.data, item);
        });
    }
}
let performAction = new PerformAction();
module.exports = performAction;
