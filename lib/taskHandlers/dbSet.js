"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");

class DbSet extends TaskHandlerBase {
    __checkItemId(storeName, user, item, cb) {
        let storeDesc = configStore.getStoreDesc(storeName, user);
        if (storeDesc.display === "single") {
            this.db.get({ "_ownerId": user._id }, storeName, (e, d) => {
                if (e) {
                    cb(this.db.newId());
                } else {
                    cb(d._id);
                }
            });
        } else {
            cb(item._id);
        }
    }
    run(storeName, user, args, cb) {
        if (args == null || !args.item || !args.item._id) {
            throw new Error("Invalid args.");
        }
        this.__checkItemId(storeName, user, args.item, (id) => {
            args.item._id = id;
            this.db.set(args.item, storeName, { "user": user }, cb);
        });
    }
}
let dbSet = new DbSet();
module.exports = dbSet;
