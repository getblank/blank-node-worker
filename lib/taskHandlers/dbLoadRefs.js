"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class DbLoadRefs extends TaskHandlerBase {
    async run(storeName, user, args) {
        //query: {"orderBy": string, "skip": int, "take": int}
        if (args == null || !args._id || !args.prop || !args.query) {
            throw new Error("Invalid args");
        }

        const storeDesc = await configStore.getStoreDesc(storeName, user);
        const propDesc = storeDesc && storeDesc.props && storeDesc.props[args.prop];
        if (
            !propDesc ||
            propDesc.type !== "virtualRefList" ||
            !propDesc.store ||
            !(propDesc.foreignKey || propDesc.query)
        ) {
            throw new Error("Invalid args: prop");
        }

        let request = Object.assign(args.query, { query: {} });
        const refStoreName = propDesc.store;
        const refStoreDesc = await configStore.getStoreDesc(refStoreName, user);
        let p;
        if (propDesc.foreignKey) {
            request.query[propDesc.foreignKey] = args._id;
            p = Promise.resolve(request);
        } else {
            p = this.db.get(storeName, args._id).then($item => {
                request.query = propDesc.query($item, user);
                return request;
            });
        }

        return p.then(res => {
            request = res;
            if (!request.orderBy) {
                delete request.orderBy;
            }

            console.debug("[DbLoadRefs] request:", JSON.stringify(request));

            return this.db
                .find(refStoreName, request, { user: user })
                .then(res => {
                    for (let i = 0; i < res.items.length; i++) {
                        let item = res.items[i];
                        if (refStoreName === "users") {
                            delete item._activationToken;
                            delete item._passwordResetToken;
                        }
                        removePasswords(item, refStoreDesc.props);
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
                        stateCounts: {},
                    };
                });
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

const dbLoadRefs = new DbLoadRefs();
module.exports = dbLoadRefs;
