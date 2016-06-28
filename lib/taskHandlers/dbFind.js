"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");

class DbSet extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args.query) {
            throw new Error("Invalid args.");
        }
        this.db.find(args.query, storeName, { user: user, loadVirtualProps: true, populate: true }, (err, res) => {
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
