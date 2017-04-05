"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");

class DbInsert extends TaskHandlerBase {
    __checkItemId(storeName, user, item, cb) {
        let storeDesc = configStore.getStoreDesc(storeName, user);
        if (storeDesc.display === "single") {
            return this.db.get(storeName, { _ownerId: user._id }, (e, d) => {
                if (e) {
                    return cb(this.db.newId());
                }

                cb(d._id);
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
            this.db.insert(storeName, args.item, { user: user }, cb);
        });
    }
}
let dbSet = new DbInsert();
module.exports = dbSet;
