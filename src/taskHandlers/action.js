"use strict";

import TaskHandlerBase from "./TaskHandlerBase";
import configStore from "../configStore";
import userScriptRequire from "../userScriptRequire";

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
        cb(null, actionDesc.script(this.db, userScriptRequire, user, item, data));
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
        this.db.get(args.itemId, storeName, (e, item) => {
            if (e) {
                cb(new Error("Item load error"), null);
                return;
            }
            this.__run(cb, actionDesc, user, args.data, item);
        });
    }
}
let performAction = new PerformAction();
export default performAction;
module.exports = performAction;
