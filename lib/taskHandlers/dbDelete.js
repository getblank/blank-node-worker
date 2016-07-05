"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");

class DbDelete extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args._id) {
            throw new Error("Invalid args.");
        }
        let ids = (Array.isArray(args._id) ? args._id : [args._id]);
        let promises = [];
        for (let _id of ids) {
            promises.push(this.db.delete(_id, storeName));
        }
        Promise.all(promises).then(() => cb(null, null)).catch(e => cb(e, null));
    }
}
let dbDelete = new DbDelete();
module.exports = dbDelete;
