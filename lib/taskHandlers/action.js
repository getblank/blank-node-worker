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
        actionDesc.script(user, item, data).then(r => cb(null, r), e => cb(e, null));
    }

    run(storeName, user, args, cb) {
        if (args == null || !args.actionId) {
            return cb(new Error("Invalid args."), null);
        }
        let actionDesc;
        try {
            actionDesc = configStore.getActionDesc(storeName, args.actionId);
        } catch (e) {
            return cb(new Error("Action not found"), null);
        }
        if (!actionDesc.storeAction && !args.itemId) {
            return cb(new Error("Invalid args: no itemId provided"), null);
        }
        if (actionDesc.storeAction || storeName === "_nav") {
            return this.__run(cb, actionDesc, user, args.data);
        }
        let storeDesc = configStore.getStoreDesc(storeName, user), createBaseIfNotFound = false;
        if (storeDesc.type === "single" || storeDesc.display === "single") {
            createBaseIfNotFound = true;
        }
        let query = args.itemId;
        if (storeDesc.display === "single") {
            query = {
                "_ownerId": user._id,
            };
        }
        this.db.get(query, storeName, (e, item) => {
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
