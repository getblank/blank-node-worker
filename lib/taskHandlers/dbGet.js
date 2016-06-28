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
            singleView = (storeDesc.display === "single");
        if (singleView) {
            query = {
                "_ownerId": user._id,
            };
        }
        this.db.get(query, storeName, { user: user }, (err, res) => {
            if (err) {
                if (singleView && (err.message === dbErrors.itemNotFound || err.message === dbErrors.storeNotFound)) {
                    res = configStore.getBaseItem(storeName, user);
                } else {
                    return cb(err, null);
                }
            }
            if (res && storeName === "users") {
                delete res.activationToken;
                delete res.passwordResetToken;
            }
            removePasswords(res, storeDesc.props);
            if (singleView) {
                res._id = storeName;
            }
            cb(null, res);
        });
    }
}


function removePasswords(item, props) {
    for (let propName of Object.keys(props || {})) {
        if (props[propName].type === "password") {
            delete item[propName];
        }
        if (props[propName].props && item[propName] != null) {
            removePasswords(item[propName], props[propName].props);
        }
    }
}

let dbGet = new DbGet();
module.exports = dbGet;
