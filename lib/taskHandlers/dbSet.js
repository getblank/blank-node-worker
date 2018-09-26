"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class DbSet extends TaskHandlerBase {
    async __checkItemId(storeName, user, item) {
        const storeDesc = await configStore.getStoreDesc(storeName, user);
        if (storeDesc.display === "single") {
            try {
                const res = await this.db.get(storeName, { _ownerId: user._id });
                return res._id;
            } catch (err) {
                return this.db.newId();
            }
        }

        return item._id;
    }

    async run(storeName, user, args, cb) {
        if (args == null || !args.item || !args.item._id) {
            throw new Error("Invalid args.");
        }

        try {
            const id = await this.__checkItemId(storeName, user, args.item);
            args.item._id = id;
            await this.db.set(storeName, args.item, { user: user }, cb);
        } catch (err) {
            return cb && cb(err);
        }
    }
}

const dbSet = new DbSet();
module.exports = dbSet;
