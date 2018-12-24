"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const { dbErrors } = require("../const");
const sync = require("../sync");

class PerformAction extends TaskHandlerBase {
    async __run(actionDesc, user, args, item) {
        if (actionDesc.hidden(user, item, {})) {
            throw new Error("Action is hidden");
        }
        if (actionDesc.disabled(user, item, {})) {
            throw new Error("Action is disabled");
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

        const { query } = args.request;
        let filter = (Array.isArray((query || {}).filter) ? query.filter : [])[0];
        if (filter) {
            try {
                filter = JSON.parse(filter);
            } catch (err) {
                throw new Error("Invalid args: request.query.filter");
            }
        }

        return actionDesc.script(user, item, args.data, args.tokenInfo, args.request, filter);
    }

    async run(storeName, user, args) {
        if (args == null || !args.actionId) {
            throw new Error("Invalid args.");
        }
        let actionDesc;
        try {
            actionDesc = configStore.getActionDesc(storeName, args.actionId);
        } catch (err) {
            throw new Error(`Action "${args.actionId}" getting error: ${err}`);
        }

        if (!actionDesc) {
            throw new Error("Action not found");
        }

        if (!actionDesc.storeAction && !args.itemId) {
            throw new Error("Invalid args: no itemId provided");
        }
        if (actionDesc.type === "http" && (args.request == null || args.request.query == null)) {
            throw new Error("Invalid args: request");
        }
        if (actionDesc.storeAction || storeName === "_nav") {
            return this.__run(actionDesc, user, args, null);
        }

        const storeDesc = await configStore.getStoreDesc(storeName, user);
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
        try {
            if (actionDesc.concurentCallsLimit === 1) {
                unlock = await sync.lock(`${storeName}-action-${actionDesc._id}`);
            }

            let item;
            try {
                item = await this.db.get(storeName, query);
            } catch (err) {
                if (
                    createBaseIfNotFound &&
                    (err.message === dbErrors.itemNotFound || err.message === dbErrors.storeNotFound)
                ) {
                    item = configStore.getBaseItem(storeName, user);
                } else {
                    throw new Error("Item load error");
                }
            }

            return this.__run(actionDesc, user, args, item);
        } finally {
            unlock && unlock();
        }
    }
}

const performAction = new PerformAction();
module.exports = performAction;
