"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const { dbErrors } = require("../const");

class DbGet extends TaskHandlerBase {
    async run(storeName, user, args, cb) {
        if (args == null || !args._id) {
            const err = new Error("Invalid args");
            cb(err);
            throw err;
        }

        const storeDesc = await configStore.getStoreDesc(storeName, user);
        if (!storeDesc) {
            const err = new Error("Store not found");
            cb(err);
            throw err;
        }

        const singleView = storeDesc.display === "single";
        let query = {
            _id: args._id,
        };

        if (singleView) {
            query = {
                _ownerId: user._id,
            };
        }

        this.db.get(storeName, query, { user: user }, (err, res) => {
            if (err) {
                if (singleView && (err.message === dbErrors.itemNotFound || err.message === dbErrors.storeNotFound)) {
                    res = configStore.getBaseItem(storeName, user);
                } else {
                    return cb(err, null);
                }
            }
            if (res && storeName === "users") {
                delete res._activationToken;
                delete res._passwordResetToken;
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

const dbGet = new DbGet();
module.exports = dbGet;
