"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class HTTPHook extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !Number.isInteger(args.hookIndex)) {
            cb(new Error("Invalid args."), null);
            return;
        }

        const hookDesc = configStore.getHttpHookDesc(storeName, args.hookIndex);
        if (hookDesc == null) {
            return cb(new Error("Http Hook not found"), null);
        }

        const res = hookDesc.script(args.request);
        if (res instanceof Promise) {
            return res.then(res => cb(null, res), err => cb(err, null));
        }
        cb(null, res);
    }
}

const httpHook = new HTTPHook();
module.exports = httpHook;
