"use strict";

import TaskHandlerBase from "./TaskHandlerBase";

class DbDelete extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args._id) {
            throw new Error("Invalid args.");
        }
        this.db.delete(args._id, storeName, cb);
    }
}
let dbDelete = new DbDelete();
export default dbDelete;
module.exports = dbDelete;
