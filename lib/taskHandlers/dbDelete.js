"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");

class DbDelete extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args._id) {
            throw new Error("Invalid args.");
        }

        const ids = (Array.isArray(args._id) ? args._id : [args._id]);
        const promises = [];
        for (let _id of ids) {
            promises.push(this.db.delete(storeName, _id));
        }
        Promise.all(promises).then(() => cb(null, null)).catch(err => cb(err, null));
    }
}

const dbDelete = new DbDelete();
module.exports = dbDelete;
