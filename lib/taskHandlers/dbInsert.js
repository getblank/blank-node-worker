"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class DbInsert extends TaskHandlerBase {
    async __checkItemId(storeName, user, item) {
        const storeDesc = await configStore.getStoreDesc(storeName, user);
        if (storeDesc.display === "single") {
            return this.db.get(storeName, { _ownerId: user._id }, (err, res) => {
                if (err) {
                    return this.db.newId();
                }

                return res._id;
            });
        }

        return item._id;
    }

    async run(storeName, user, args) {
        if (args == null || !args.item || !args.item._id) {
            throw new Error("Invalid args.");
        }

        const id = await this.__checkItemId(storeName, user, args.item);
        args.item._id = id;

        return this.db.insert(storeName, args.item, { user: user });
    }
}

const dbSet = new DbInsert();
module.exports = dbSet;
