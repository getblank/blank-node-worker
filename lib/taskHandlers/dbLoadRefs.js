"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var configStore = require("../configStore");

class DbSet extends TaskHandlerBase {
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
            !storeDesc.props[propName].foreignKey) {
            throw new Error("Invalid args: prop");
        }
        let request = Object.assign(args.query, { "query": {} }),
            refStoreName = storeDesc.props[propName].store,
            foreignKey = storeDesc.props[propName].foreignKey;
        request.query[foreignKey] = args._id;
        if (!request.orderBy) {
            delete request.orderBy;
        }
        console.log("Request:", request);
        this.db.find(request, refStoreName, { user: user }, (err, res) => {
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
            res.fullCount = res.count; // TODO: remove this line when client updated
            cb(null, res);
        });
    }
}
let dbSet = new DbSet();
module.exports = dbSet;
