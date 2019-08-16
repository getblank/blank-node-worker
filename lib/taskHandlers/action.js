"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const { dbErrors } = require("../const");
const sync = require("../sync");

class PerformAction extends TaskHandlerBase {
    async __run(actionDesc, user, args, item) {
        const request = args.request || {};
        const { tokenInfo } = args;
        let { data } = args;

        let syslogId, actionError, res;
        try {
            const record = {
                store: actionDesc.storeName,
                userId: user._id,
                itemId: item && item._id,
                action: "action",
                actionData: {
                    actionId: actionDesc._id,
                    storeAction: actionDesc.storeAction,
                    request,
                    tokenInfo,
                    data,
                },
            };
            const syslogRecord = await this.db.insert("syslog", record);
            syslogId = syslogRecord._id;
        } catch (err) {
            console.error("Can't create syslog record", err);
        }

        try {
            if (typeof request.data === "string" && request.data !== "") {
                try {
                    data = JSON.parse(request.data);
                } catch (err) {
                    console.warn("Unknown data format in action", err);
                }
            } else if (typeof request.body === "string" && request.body !== "") {
                try {
                    data = JSON.parse(request.body);
                } catch (err) {
                    console.warn("Unknown data format in action.body", err);
                }
            }

            const { query } = request;
            let filter = (Array.isArray((query || {}).filter) ? query.filter : [])[0];
            if (filter) {
                try {
                    filter = JSON.parse(filter);
                } catch (err) {
                    throw new Error("Invalid args: request.query.filter");
                }
            }

            if (actionDesc.hidden(user, item, {})) {
                throw new Error("Action is hidden");
            }
            if (actionDesc.disabled(user, item, {})) {
                throw new Error("Action is disabled");
            }

            res = await actionDesc.script(user, item, data, tokenInfo, request, filter);
        } catch (err) {
            actionError = err;
        }

        if (syslogId) {
            try {
                await this.db.set("syslog", {
                    _id: syslogId,
                    result: { err: actionError && actionError.message, result: res },
                });
            } catch (err) {
                console.error(`Can't update syslog record _id: ${syslogId}`, err);
            }
        }

        if (actionError) {
            throw actionError;
        }

        return res;
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

        actionDesc.storeName = storeName;

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
            if (!actionDesc.storeAction) {
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
            }

            return this.__run(actionDesc, user, args, item);
        } finally {
            unlock && unlock();
        }
    }
}

const performAction = new PerformAction();
module.exports = performAction;
