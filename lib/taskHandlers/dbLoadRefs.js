"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");

class DbLoadRefs extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        //query: {"orderBy": string, "skip": int, "take": int}
        if (args == null || !args._id || !args.prop || !args.query) {
            throw new Error("Invalid args");
        }
        let storeDesc = configStore.getStoreDesc(storeName, user);
        let propName = args.prop;
        if (storeDesc.props == null || storeDesc.props[propName] == null ||
            storeDesc.props[propName].type !== "virtualRefList" ||
            !storeDesc.props[propName].store ||
            !(storeDesc.props[propName].foreignKey || storeDesc.props[propName].query)) {
            throw new Error("Invalid args: prop");
        }
        let request = Object.assign(args.query, { "query": {} });
        let refStoreName = storeDesc.props[propName].store;
        let refStoreDesc = configStore.getStoreDesc(refStoreName, user);
        let p;
        if (storeDesc.props[propName].foreignKey) {
            let foreignKey = storeDesc.props[propName].foreignKey;
            request.query[foreignKey] = args._id;
            p = Promise.resolve(request);
        } else {
            p = this.db.get(storeName, args._id)
                .then($item => {
                    request.query = storeDesc.props[propName].query($item, user);
                    return request;
                });
        }
        p.then(res => {
            request = res;
            if (!request.orderBy) {
                delete request.orderBy;
            }
            console.log("Request:", request);
            this.db.find(refStoreName, request, { user: user }, (err, res) => {
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
                    if (refStoreName === "users") {
                        delete item._activationToken;
                        delete item._passwordResetToken;
                    }
                    removePasswords(item, refStoreDesc.props);
                }
                res.fullCount = res.count; // TODO: remove this line when client updated
                cb(null, res);
            });
        })
            .catch(err => cb(err));
    }
}
let dbLoadRefs = new DbLoadRefs();
module.exports = dbLoadRefs;

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