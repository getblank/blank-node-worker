"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class UserConfig extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (!configStore.isReady()) {
            throw new Error("Config not ready");
        }

        return configStore.getConfig(user, true);
    }
}

const userConfig = new UserConfig();
module.exports = userConfig;
