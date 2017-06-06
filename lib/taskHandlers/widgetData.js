"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class WidgetData extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args.widgetId) {
            return cb(new Error("Invalid args."), null);
        }

        let widgetDesc;
        try {
            widgetDesc = configStore.getWidgetDesc(storeName, args.widgetId);
        } catch (err) {
            return cb(err, null);
        }

        widgetDesc.load(user, args.data, args.itemId).then(r => cb(null, r), e => cb(e, null));
    }
}

const widgetData = new WidgetData();
module.exports = widgetData;
