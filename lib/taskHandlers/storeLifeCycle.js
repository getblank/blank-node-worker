"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const versionsStore = "_versions";

const pTimeout = (timeout) => {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
};

class StoreLifeCycle extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (user._id !== "system") {
            cb(new Error("Access denied"), null);
            return;
        }

        if (args == null || !args.event) {
            cb(new Error("Invalid args"), null);
            return;
        }

        const eventDesc = configStore.getStoreEventHandler(storeName, args.event);
        if (eventDesc == null) {
            return cb(new Error("Handler not found"), null);
        }

        return this._getStoreVersion(storeName)
            .then(res => {
                const setter = this._saveStoreVersion(storeName);
                return eventDesc(res, setter);
            })
            .then(res => {
                cb(null, res);
            })
            .catch(err => {
                cb(err);
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
        return (version) => {
            return this.db.mongo._set(versionsStore, storeName, { version });
        };
    }
}

const storeLifeCycle = new StoreLifeCycle();
module.exports = storeLifeCycle;
