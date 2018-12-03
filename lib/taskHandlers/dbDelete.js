"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class DbDelete extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (args == null || !args._id) {
            throw new Error("Invalid args.");
        }

        const storeDesc = await configStore.getStoreDesc(storeName, user);
        if (storeDesc.dataSource.type === "postgres") {
            return this.db.begin(async tx => {
                const ids = Array.isArray(args._id) ? args._id : [args._id];
                for (const _id of ids) {
                    await this.db.delete(storeName, _id, { tx, user });
                }
            });
        }

        const ids = Array.isArray(args._id) ? args._id : [args._id];
        for (const _id of ids) {
            await this.db.delete(storeName, _id, { user });
        }
    }
}

const dbDelete = new DbDelete();
module.exports = dbDelete;
