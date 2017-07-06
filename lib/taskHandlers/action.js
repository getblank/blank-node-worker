"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const { dbErrors } = require("../const");
const sync = require("../sync");

class PerformAction extends TaskHandlerBase {
    __run(actionDesc, user, args, item, cb) {
        if (actionDesc.hidden(user, item, {})) {
            return cb(new Error("Action is hidden"), null);
        }
        if (actionDesc.disabled(user, item, {})) {
            return cb(new Error("Action is disabled"), null);
        }
        args.request = args.request || {};
        if (typeof args.request.data === "string" && args.request.data !== "") {
            try {
                const data = JSON.parse(args.request.data);
                args.data = data;
            } catch (err) {
                console.warn("Unknown data format in action", err);
            }
        } else if (typeof args.request.body === "string" && args.request.body !== "") {
            try {
                const data = JSON.parse(args.request.body);
                args.data = data;
            } catch (err) {
                console.warn("Unknown data format in action.body", err);
            }
        }

        if (actionDesc.type === "http") {
            const query = args.request.query;
            let filter = (Array.isArray(query.filter) ? query.filter : [])[0];
            if (filter) {
                try {
                    filter = JSON.parse(filter);
                } catch (e) {
                    return cb(new Error("Invalid args: request.query.filter"), null);
                }
            }
            actionDesc.script(user, item, args.data, args.tokenInfo, args.request, filter).then(r => cb(null, r), e => cb(e, null));
        } else {
            actionDesc.script(user, item, args.data, args.tokenInfo).then(r => cb(null, r), e => cb(e, null));
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

        const storeDesc = configStore.getStoreDesc(storeName, user);
        let createBaseIfNotFound = false;
        if (storeDesc.type === "single" || storeDesc.display === "single") {
            createBaseIfNotFound = true;
        }
        let query = args.itemId;
        if (storeDesc.display === "single") {
            query = {
                _ownerId: user._id,
            };
        }

        let unlock;
        const _perform = () => {
            this.db.get(storeName, query, (err, item) => {
                if (err) {
                    if (createBaseIfNotFound && (err.message === dbErrors.itemNotFound || err.message === dbErrors.storeNotFound)) {
                        item = configStore.getBaseItem(storeName, user);
                    } else {
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

const performAction = new PerformAction();
module.exports = performAction;
