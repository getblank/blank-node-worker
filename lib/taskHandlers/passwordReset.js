"use strict";

const fs = require("fs");
const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const UserError = require("../userError");
const email = require("../email");
const handlebars = require("handlebars");

class PasswordReset extends TaskHandlerBase {
    run(storeName, _, args, cb) {
        if (args == null || !args.token || !args.password) {
            return cb(new UserError("Invalid args. Must be token:string and password:string at least"), null);
        }

        const commonSettings = configStore.getStoreDesc("_commonSettings").entries;
        if (commonSettings.resetPasswordDisabled) {
            return cb(new UserError("password reset disabled"));
        }
        let user;
        this.db.get("users", { _passwordResetToken: args.token, isActive: true }, { noPopulate: true }).then(_user => {
            return this.db.set("users", { _id: _user._id, password: args.password, _passwordResetExpires: null, _passwordResetToken: null });
        }).catch(err => {
            throw new Error("user not found");
        }).then(_user => {
            user = _user;
            return fs.readLib("templates/password-reset-success-email.html");
        }).then(template => {
            let body = handlebars.compile(template)({ user: user, commonSettings: commonSettings });
            let message = {
                subject: `${commonSettings.title} password successfully updated`,
                to: user.email,
                body: body,
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

const passwordReset = new PasswordReset();
module.exports = passwordReset;
