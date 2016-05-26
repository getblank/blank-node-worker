"use strict";

import TaskHandlerBase from "./TaskHandlerBase";
import configStore from "../configStore";

class HTTPHook extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !Number.isInteger(args.hookIndex)) {
            cb(new Error("Invalid args."), null);
            return;
        }
        let hookDesc = configStore.getHttpHookDesc(storeName, args.hookIndex);
        if (hookDesc == null) {
            return cb(new Error("Http Hook not found"), null);
        }
        let res = hookDesc.script(args.request);
        if (res instanceof Promise) {
            return res.then(r => cb(null, r), e => cb (e, null));
        }
        cb(null, res);
    }
}
let httpHook = new HTTPHook();
export default httpHook;
module.exports = httpHook;
