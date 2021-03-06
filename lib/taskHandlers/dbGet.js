"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const { dbErrors } = require("../const");

class DbGet extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (!args || !args._id) {
            const err = new Error("Invalid args");
            throw err;
        }

        const storeDesc = await configStore.getStoreDesc(storeName, user);
        if (!storeDesc) {
            const err = new Error("Store not found");
            throw err;
        }

        const singleView = storeDesc.display === "single";
        const query = { _ownerId: user._id };
        if (!singleView) {
            delete query._ownerId;
            query._id = args._id;
            if (args.__v) {
                query.__v = args.__v;
            }

            switch (storeDesc.props._id.type) {
                case "int":
                case "float":
                    query._id = query._id * 1;
            }
        }

        try {
            const res = await this.db.get(storeName, query, { user: user });
            if (res && storeName === "users") {
                delete res._activationToken;
                delete res._passwordResetToken;
            }

            removePasswords(res, storeDesc.props);
            if (singleView) {
                res._id = storeName;
            }

            return res;
        } catch (err) {
            if (singleView && (err.message === dbErrors.itemNotFound || err.message === dbErrors.storeNotFound)) {
                return configStore.getBaseItem(storeName, user);
            }

            throw err;
        }
    }
}

function removePasswords(item, props) {
    for (const propName of Object.keys(props || {})) {
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
