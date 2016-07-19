"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");

class PerformAction extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args.widgetId) {
            return cb(new Error("Invalid args."), null);
        }
        let widgetDesc;
        try {
            widgetDesc = configStore.getWidgetDesc(storeName, args.widgetId);
        } catch (e) {
            return cb(new Error("Widget not found"), null);
        }
        widgetDesc.load(user, args.data, args.itemId).then(r => cb(null, r), e => cb(e, null));
    }
}
let performAction = new PerformAction();
module.exports = performAction;
