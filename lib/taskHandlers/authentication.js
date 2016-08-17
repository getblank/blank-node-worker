"use strict";

var TaskHandlerBase = require("./TaskHandlerBase");
var hash = require("../hash");
var UserError = require("../userError");

class Authentication extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args.login || !args.password) {
            return cb(new UserError("Invalid args. Must be login:string and password:string"), null);
        }
        this.db.get({ "login": args.login, isActive: true }, "users", { "populate": true }, (e, user) => {
            if (e != null) {
                return cb(new UserError("User not found"), null);
            }
            if (typeof user.password !== "object" || user.password == null || !user.password.salt || !user.password.key) {
                return cb(new UserError("Invalid user data, please contact system administrator"), null);
            }

            var key = new Buffer(args.password);
            hash.calc(key, user.password.salt, function (err, res) {
                if (user.password.key != res) {
                    return cb(new UserError("Password not match"), null);
                }
                delete user.password;
                delete user.activationToken;
                delete user.passwordResetToken;
                cb(null, user);
            });
        });
    }
}
let authentication = new Authentication();
module.exports = authentication;
