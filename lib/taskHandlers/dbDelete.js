"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");

class DbDelete extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (args == null || !args._id) {
            throw new Error("Invalid args.");
        }

        const ids = Array.isArray(args._id) ? args._id : [args._id];
        for (const _id of ids) {
            await this.db.delete(storeName, _id);
        }
    }
}

const dbDelete = new DbDelete();
module.exports = dbDelete;
