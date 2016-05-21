"use strict";

import TaskHandlerBase from "./TaskHandlerBase";
import configStore from "../configStore";

class UserConfig extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (!configStore.isReady()) {
            cb(new Error("Config not ready"), null);
            return;
        }
        cb(null, configStore.getConfig(user));
    }
}
let userConfig = new UserConfig();
export default userConfig;
module.exports = userConfig;
