"use strict";

import TaskHandlerBase from "./TaskHandlerBase";
import configStore from "../configStore";
import {dbErrors} from "../const";

class DbGet extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args._id) {
            throw new Error("Invalid args");
        }
        let storeDesc = configStore.getStoreDesc(storeName, user),
            query = {
                "_id": args._id,
            },
            queryStoreName = storeName,
            returnBaseWhenNotFound = false;
        if (storeDesc == null) {
            throw new Error("Store not found or access denied");
        }
        if (storeDesc.type === "single") {
            queryStoreName = "_singles";
        }
        if (storeDesc.display === "single") {
            returnBaseWhenNotFound = true;
            query = {
                "_ownerId": user._id,
            };
        }
        this.db.get(query, queryStoreName, (err, res) => {
            if (err) {
                if (returnBaseWhenNotFound && (err.message === dbErrors.itemNotFound || err.message === dbErrors.storeNotFound)) {
                    return cb(null, configStore.getBaseItem(storeName, user));
                }
                return cb(err, null);
            }
            if (res && storeName === "users") {
                delete res.hashedPassword;
                delete res.salt;
                delete res.activationToken;
                delete res.passwordResetToken;
            }
            cb(null, res);
        });
    }
}
let dbGet = new DbGet();
export default dbGet;
module.exports = dbGet;
