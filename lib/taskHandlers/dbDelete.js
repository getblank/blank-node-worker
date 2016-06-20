"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");

class DbDelete extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args._id) {
            throw new Error("Invalid args.");
        }
        this.db.delete(args._id, storeName, cb);
    }
}
let dbDelete = new DbDelete();
module.exports = dbDelete;
