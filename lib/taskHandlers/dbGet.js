"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");
var {dbErrors} = require("../const");

class DbGet extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args._id) {
            throw new Error("Invalid args");
        }
        let storeDesc = configStore.getStoreDesc(storeName, user),
            query = {
                "_id": args._id,
            },
            singleView = storeDesc.display === "single";
        if (singleView) {
            query = {
                "_ownerId": user._id,
            };
        }
        this.db.get(query, storeName, {loadVirtualProps: true, user: user, populate: true}, (err, res) => {
            if (err) {
                if (singleView && (err.message === dbErrors.itemNotFound || err.message === dbErrors.storeNotFound)) {
                    res = configStore.getBaseItem(storeName, user);
                } else {
                    return cb(err, null);
                }
            }
            if (res && storeName === "users") {
                delete res.hashedPassword;
                delete res.salt;
                delete res.activationToken;
                delete res.passwordResetToken;
            }
            if (singleView) {
                res._id = storeName;
            }
            cb(null, res);
        });
    }
}
let dbGet = new DbGet();
module.exports = dbGet;
