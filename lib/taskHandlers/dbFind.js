"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

const convertValueToInt = value => {
    if (Array.isArray(value)) {
        value.forEach((val, i) => {
            value[i] = convertValueToInt(val);
        });

        return value;
    }

    return parseInt(value, 10);
};

class DbFind extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (args == null || !args.query) {
            throw new Error("Invalid args.");
        }

        const storeDesc = await configStore.getStoreDesc(storeName, user);
        if (!storeDesc) {
            throw new Error(`store ${storeName} not found`);
        }

        const query = args.query;
        if ((query.query || {})._state !== undefined) {
            if (storeDesc.props._state) {
                if (storeDesc.props._state.type === "int") {
                    query.query._state = convertValueToInt(query.query._state);
                }
            }
        }

        return this.db
            .find(storeName, query, { user: user })
            .then(res => {
                for (let i = 0; i < res.items.length; i++) {
                    const item = res.items[i];
                    if (storeName === "users") {
                        delete item._activationToken;
                        delete item._passwordResetToken;
                    }
                    removePasswords(item, storeDesc.props);
                }

                res.fullCount = res.count; // TODO: remove this line when client updated
                return res;
            })
            .catch(err => {
                if (err.message !== "Not found") {
                    throw err;
                }

                return {
                    count: 0,
                    items: [],
                    currentIndex: null,
                    currentItem: null,
                };
            });
    }
}

const dbFind = new DbFind();
module.exports = dbFind;

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
