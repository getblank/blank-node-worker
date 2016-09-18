"use strict";

let TaskHandlerBase = require("./TaskHandlerBase");
let configStore = require("../configStore");

class DbFind extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args.query) {
            throw new Error("Invalid args.");
        }
        let storeDesc = configStore.getStoreDesc(storeName, user);
        this.db.find(storeName, args.query, { user: user }, (err, res) => {
            if (err) {
                if (err.message !== "Not found") {
                    return cb(err, res);
                }
                res = {
                    count: 0,
                    items: [],
                    currentIndex: null,
                    currentItem: null,
                    stateCounts: {},
                };
            }
            for (let i = 0; i < res.items.length; i++) {
                let item = res.items[i];
                if (storeName === "users") {
                    delete item._activationToken;
                    delete item._passwordResetToken;
                }
                removePasswords(item, storeDesc.props);
            }

            res.fullCount = res.count; // TODO: remove this line when client updated
            cb(null, res);
        });
    }
}
let dbFind = new DbFind();
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