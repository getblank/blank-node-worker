"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class HTTPHook extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (args == null || !Number.isInteger(args.hookIndex)) {
            throw new Error("Invalid args");
        }

        const hookDesc = configStore.getHttpHookDesc(storeName, args.hookIndex);
        if (hookDesc == null) {
            throw new Error("Http Hook not found");
        }

        return hookDesc.script(args.request);
    }
}

const httpHook = new HTTPHook();
module.exports = httpHook;
