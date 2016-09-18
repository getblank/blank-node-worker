"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");

class DbPush extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args._id || !args.prop || !args.data) {
            throw new Error("Invalid args");
        }
        let storeDesc = configStore.getStoreDesc(storeName, user);
        let propName = args.prop;
        if (storeDesc.props == null || storeDesc.props[propName] == null ||
            (storeDesc.props[propName].type !== "objectList" && storeDesc.props[propName].type !== "comments")) {
            throw new Error("Invalid args: prop");
        }
        let res = { "_id": args._id };
        res[propName] = {
            "$push": args.data,
        };
        this.db.set(storeName, res, { "user": user })
            .then(() => {
                cb(null, null);
            }).catch((e) => {
                cb(e, null);
            });
    }
}
let dbPush = new DbPush();
module.exports = dbPush;
