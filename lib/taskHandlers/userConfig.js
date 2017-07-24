"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class UserConfig extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (!configStore.isReady()) {
            cb(new Error("Config not ready"), null);
            return;
        }

        cb(null, configStore.getConfig(user, true));
    }
}

const userConfig = new UserConfig();
module.exports = userConfig;
