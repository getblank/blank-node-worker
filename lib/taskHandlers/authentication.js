"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var hash = require("../hash");
var UserError = require("../userError");

class Authentication extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args.login || !args.password) {
            return cb(new UserError("Invalid args. Must be login:string and password:string"), null);
        }
        this.db.get({"login": args.login}, "users", (e, user) => {
            if (e != null) {
                return cb(new UserError("User not found"), null);
            }
            if (!user.salt || !user.hashedPassword) {
                return cb(new UserError("Invalid user data, please contact system administrator"), null);
            }

            var key = new Buffer(args.password);
            hash.calc(key, user.salt, function (err, res) {
                if (user.hashedPassword != res) {
                    return cb(new UserError("Password not match"), null);
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
module.exports = authentication;
