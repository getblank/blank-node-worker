"use strict";

import TaskHandlerBase from "./TaskHandlerBase";
import scrypt from "scrypt";

class Authentication extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args.login || !args.password) {
            return cb(new Error("Invalid args. Must be login:string and password:string"), null);
        }
        this.db.get({"login": args.login}, "users", (e, user) => {
            if (e != null) {
                return cb(new Error("User not found"), null);
            }

            var key = new Buffer(args.password);
            scrypt.hash(key, { "N": 16384, "r": 8, "p": 1 }, 32, user.salt, function (err, res) {
                let resStr = res.toString("base64");
                if (user.hashedPassword != resStr) {
                    return cb(new Error("Password not match"), null);
                }
                delete user.hashedPassword;
                delete user.salt;
                delete user.activationToken;
                delete user.passwordResetToken;

                cb(null, user);
            });
        });
    }
}
let authentication = new Authentication();
export default authentication;
module.exports = authentication;
