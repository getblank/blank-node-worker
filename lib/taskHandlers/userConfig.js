"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class UserConfig extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (!configStore.isReady()) {
            cb(new Error("Config not ready"), null);
            return;
        }

        configStore.getConfig(user, true).then(res => cb(null, res), err => cb(err));
    }
}

const userConfig = new UserConfig();
module.exports = userConfig;
