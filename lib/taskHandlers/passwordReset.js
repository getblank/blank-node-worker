"use strict";

const fs = require("fs");
const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const UserError = require("../userError");
const email = require("../email");
const handlebars = require("handlebars");
const crypto = require("crypto");

class PasswordReset extends TaskHandlerBase {
    async run(storeName, _, args) {
        if (args == null || !args.token || (!args.password && !args.hashedPassword)) {
            throw new UserError("Invalid args. Must be token:string and password:string at least");
        }

        const commonSettings = (await configStore.getStoreDesc("_commonSettings")).entries;
        if (commonSettings.resetPasswordDisabled) {
            throw new UserError("password reset disabled");
        }

        let user;
        const password = args.hashedPassword
            ? args.hashedPassword
            : crypto
                  .createHash("md5")
                  .update(args.password)
                  .digest("hex");

        return this.db
            .get("users", { _passwordResetToken: args.token, isActive: true }, { noPopulate: true })
            .then(_user => {
                return this.db.set("users", {
                    _id: _user._id,
                    password,
                    _passwordResetExpires: null,
                    _passwordResetToken: null,
                });
            })
            .catch(err => {
                throw new Error("user not found");
            })
            .then(_user => {
                user = _user;
                return fs.readLib("templates/password-reset-success-email.html");
            })
            .then(template => {
                let body = handlebars.compile(template)({ user: user, commonSettings: commonSettings });
                let message = {
                    subject: `${commonSettings.title} password successfully updated`,
                    to: user.email,
                    body: body,
                };
                return email.send(message);
            })
            .catch(err => {
                console.error("[PasswordReset] error", err);
                throw err;
            });
    }
}

const passwordReset = new PasswordReset();
module.exports = passwordReset;
