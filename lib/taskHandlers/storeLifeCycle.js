"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const versionsStore = "_versions";

const pTimeout = timeout => {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
};

class StoreLifeCycle extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (user._id !== "system") {
            throw new Error("Access denied");
        }

        if (args == null || !args.event) {
            throw new Error("Invalid args");
        }

        const eventDesc = configStore.getStoreEventHandler(storeName, args.event);
        if (!eventDesc) {
            throw new Error("Handler not found");
        }

        return this._getStoreVersion(storeName).then(res => {
            const setter = this._saveStoreVersion(storeName);

            return eventDesc(res, setter);
        });
    }

    async _getStoreVersion(storeName) {
        while (!this.db.mongo.connected) {
            await pTimeout(100);
        }

        try {
            const ver = await this.db.mongo.get(versionsStore, storeName);
            return ver.version;
        } catch (err) {
            if (err.message !== "Not found") {
                throw err;
            }

            return 0;
        }
    }

    _saveStoreVersion(storeName) {
        return version => {
            return this.db.mongo._set(versionsStore, storeName, { version });
        };
    }
}

const storeLifeCycle = new StoreLifeCycle();
module.exports = storeLifeCycle;
