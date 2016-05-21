"use strict";

import TaskHandlerBase from "./TaskHandlerBase";

class DbGet extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args._id) {
            throw new Error("Invalid args.");
        }
        this.db.get(args._id, storeName, (err, res) => {
            if (err) {
                return cb(err, null);
            }
            if (res && storeName === "users") {
                delete res.hashedPassword;
                delete res.salt;
                delete res.activationToken;
                delete res.passwordResetToken;
            }
            cb(null, res);
        });
    }
}
let dbGet = new DbGet();
export default dbGet;
module.exports = dbGet;
