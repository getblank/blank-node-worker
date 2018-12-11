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

        const storeDesc = await configStore.getStoreDesc(storeName);
        if (!storeDesc) {
            throw new Error("Store not found");
        }

        const eventDesc = configStore.getStoreEventHandler(storeName, args.event);
        if (!eventDesc) {
            throw new Error("Handler not found");
        }

        const { dataSource } = storeDesc;
        return this._getStoreVersion(storeName, dataSource.type).then(res => {
            const setter = this._saveStoreVersion(storeName, dataSource.type);

            return eventDesc(res, setter);
        });
    }

    async _getStoreVersion(storeName, dbType) {
        await this.db.waitForConnection(storeName);
        switch (dbType) {
            case "postgres":
                try {
                    const pg = this.db.postgres();
                    const table = await pg.table(versionsStore);
                    const ver = await table.get({
                        _id: storeName,
                    });

                    return ver.version;
                } catch (err) {
                    if (err.message !== "Not found") {
                        throw err;
                    }

                    return 0;
                }
            case "mongo":
                try {
                    const ver = await this.db.mongo.get(versionsStore, storeName);
                    return ver.version;
                } catch (err) {
                    if (err.message !== "Not found") {
                        throw err;
                    }

                    return 0;
                }
            default:
                throw new Error(`unknown DB source type "${dbType}" for migration`);
        }
    }

    _saveStoreVersion(storeName, dbType) {
        return async version => {
            switch (dbType) {
                case "postgres": {
                    const pg = this.db.postgres();
                    const table = await pg.table(versionsStore);
                    return table.insert({
                        _id: storeName,
                        version,
                    });
                }
                case "mongo":
                    return this.db.mongo._set(versionsStore, storeName, { version });
                default:
                    throw new Error(`unknown DB source type "${dbType}" for migration`);
            }
        };
    }
}

const storeLifeCycle = new StoreLifeCycle();
module.exports = storeLifeCycle;
