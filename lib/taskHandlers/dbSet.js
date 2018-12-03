"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class DbSet extends TaskHandlerBase {
    async __checkItemId(storeDesc, user, item) {
        if (storeDesc.display === "single") {
            try {
                const res = await this.db.get(storeDesc.name, { _ownerId: user._id });
                return res._id;
            } catch (err) {
                return this.db.newId();
            }
        }

        return item._id;
    }

    async run(storeName, user, args) {
        if (args == null || !args.item || !args.item._id) {
            throw new Error("Invalid args.");
        }

        const storeDesc = await configStore.getStoreDesc(storeName, user);
        const id = await this.__checkItemId(storeDesc, user, args.item);
        args.item._id = id;

        if (storeDesc.dataSource.type === "postgres") {
            return this.db.begin(tx => this.db.set(storeName, args.item, { user, tx }));
        }

        return this.db.set(storeName, args.item, { user });
    }
}

const dbSet = new DbSet();
module.exports = dbSet;
