"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");
var {dbErrors} = require("../const");
let sync = require("../sync");

class PerformAction extends TaskHandlerBase {
    __run(actionDesc, user, args, item, cb) {
        if (actionDesc.hidden(user, item)) {
            return cb(new Error("Action is hidden"), null);
        }
        if (actionDesc.disabled(user, item)) {
            return cb(new Error("Action is disabled"), null);
        }
        if (typeof (args.request || {}).data === "string") {
            try {
                const data = JSON.parse(args.request.data);
                args.data = data;
            } catch (err) {
                console.warn("Unknown data format in action", err);
            }
        }
        if (actionDesc.type === "http") {
            let query = args.request.query;
            let filter = (Array.isArray(query.filter) ? query.filter : [])[0];
            if (filter) {
                try {
                    filter = JSON.parse(filter);
                } catch (e) {
                    return cb(new Error("Invalid args: request.query.filter"), null);
                }
            }
            actionDesc.script(user, item, args.data, args.request, filter).then(r => cb(null, r), e => cb(e, null));
        } else {
            actionDesc.script(user, item, args.data).then(r => cb(null, r), e => cb(e, null));
        }
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
        if (actionDesc.type === "http" && (args.request == null || args.request.query == null)) {
            return cb(new Error("Invalid args: request"), null);
        }
        if (actionDesc.storeAction || storeName === "_nav") {
            return this.__run(actionDesc, user, args, null, cb);
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

        let unlock;
        let _perform = () => {
            this.db.get(storeName, query, (e, item) => {
                if (e) {
                    if (createBaseIfNotFound && (e.message === dbErrors.itemNotFound || e.message === dbErrors.storeNotFound)) {
                        item = configStore.getBaseItem(storeName, user);
                    } else {
                        console.log(e);
                        unlock && unlock();
                        return cb(new Error("Item load error"), null);
                    }
                }
                this.__run(actionDesc, user, args, item, (err, res) => {
                    unlock && unlock();
                    cb(err, res);
                });
            });
        };

        if (actionDesc.concurentCallsLimit === 1) {
            sync.lock(`${storeName}-action-${actionDesc._id}`, _unlock => {
                unlock = _unlock;
                _perform();
            });
            return;
        }
        _perform();
    }
}
let performAction = new PerformAction();
module.exports = performAction;
