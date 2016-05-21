"use strict";

import TaskHandlerBase from "./TaskHandlerBase";

class DbSet extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args.item || !args.item._id) {
            throw new Error("Invalid args.");
        }
        this.db.set(args.item, storeName, cb);
    }
}
let dbSet = new DbSet();
export default dbSet;
module.exports = dbSet;
