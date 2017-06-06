"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class DbSet extends TaskHandlerBase {
    __checkItemId(storeName, user, item, cb) {
        let storeDesc = configStore.getStoreDesc(storeName, user);
        if (storeDesc.display === "single") {
            return this.db.get(storeName, { _ownerId: user._id }, (err, res) => {
                if (err) {
                    return cb(this.db.newId());
                }

                cb(res._id);
            });
        }

        cb(item._id);
    }
    run(storeName, user, args, cb) {
        if (args == null || !args.item || !args.item._id) {
            throw new Error("Invalid args.");
        }
        this.__checkItemId(storeName, user, args.item, (id) => {
            args.item._id = id;
            this.db.set(storeName, args.item, { user: user }, cb);
        });
    }
}

const dbSet = new DbSet();
module.exports = dbSet;
