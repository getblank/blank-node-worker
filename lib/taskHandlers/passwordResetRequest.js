"use strict";

const fs = require("fs");
const uuid = require("uuid");
const moment = require("moment");
const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const UserError = require("../userError");
const email = require("../email");
const handlebars = require("handlebars");

class PasswordResetRequest extends TaskHandlerBase {
    async run(storeName, _, args) {
        if (args == null || !args.email) {
            throw new UserError("Invalid args. Must be email:string");
        }

        const commonSettings = configStore.getStoreDesc("_commonSettings").entries;
        const serverSettings = configStore.getStoreDesc("_serverSettings").entries;
        if (commonSettings.resetPasswordDisabled) {
            throw new UserError("password reset disabled");
        }

        let user;
        return this.db
            .get("users", { $or: [{ login: args.email }, { email: args.email }], isActive: true }, { noPopulate: true })
            .then(_user => {
                const now = new moment();
                if (serverSettings.passwordResetTokenExpiration) {
                    let timeout = (serverSettings.passwordResetTokenExpiration + "").split(":");
                    let hours = timeout[0].trim() * 1;
                    let minutes = timeout[1] ? timeout[1].trim() * 1 : 0;
                    now.add(hours, "hours");
                    now.add(minutes, "minutes");
                } else {
                    now.add(1, "hours");
                }
                return this.db.set("users", {
                    _id: _user._id,
                    _passwordResetExpires: now.toDate(),
                    _passwordResetToken: uuid.v4(),
                });
            })
            .catch(err => {
                throw new Error("user not found");
            })
            .then(_user => {
                user = _user;
                return fs.readLib("templates/password-reset-email.html");
            })
            .then(template => {
                let url = `${commonSettings.baseUrl}/app/?token=${user._passwordResetToken}#reset-password`;
                let body = handlebars.compile(template)({ user: user, url: url, commonSettings: commonSettings });
                let message = {
                    subject: `${commonSettings.title} password reset`,
                    to: user.email,
                    body: body,
                };
                return email.send(message);
            })
            .catch(err => {
                console.error("[PasswordResetRequest] error", err);
                throw err;
            });
    }
}

const passwordResetRequest = new PasswordResetRequest();
module.exports = passwordResetRequest;
