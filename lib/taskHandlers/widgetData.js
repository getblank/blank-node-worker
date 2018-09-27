"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class WidgetData extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (args == null || !args.widgetId) {
            throw new Error("Invalid args.");
        }

        const widgetDesc = configStore.getWidgetDesc(storeName, args.widgetId);

        return widgetDesc.load(user, args.filter || args.data, args.filter || args.data, args.itemId);
    }
}

const widgetData = new WidgetData();
module.exports = widgetData;
