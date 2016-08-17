"use strict";

let fs = require("fs");
let TaskHandlerBase = require("./TaskHandlerBase");
let configStore = require("../configStore");
let UserError = require("../userError");
let email = require("../email");
let handlebars = require("handlebars");

class PasswordReset extends TaskHandlerBase {
    run(storeName, _, args, cb) {
        if (args == null || !args.token || !args.password) {
            return cb(new UserError("Invalid args. Must be token:string and password:string at least"), null);
        }
        let commonSettings = configStore.getStoreDesc("_commonSettings").entries;
        if (commonSettings.resetPasswordDisabled) {
            return cb(new UserError("password reset disabled"));
        }
        let user;
        this.db.get({ _passwordResetToken: args.token, isActive: true }, "users", { "noPopulate": true }).then(_user => {
            return this.db.set({ _id: _user._id, password: args.password, _passwordResetExpires: null, _passwordResetToken: null }, "users");
        }).catch(err => {
            throw new Error("user not found");
        }).then(_user => {
            user = _user;
            return fs.readLib("templates/password-reset-success-email.html");
        }).then(template => {
            let body = handlebars.compile(template)({ "user": user, "commonSettings": commonSettings });
            let message = {
                "subject": `${commonSettings.title} password successfully updated`,
                "to": user.email,
                "body": body,
            };
            return email.send(message);
        }).then(() => {
            cb(null, null);
        }).catch(err => {
            console.error("[PasswordReset] error", err);
            cb(err, null);
        });
    }
}
let passwordReset = new PasswordReset();
module.exports = passwordReset;
