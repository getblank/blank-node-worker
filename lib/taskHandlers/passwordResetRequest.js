"use strict";

const fs = require("fs");
const uuid = require("uuid");
const moment = require("moment");
const handlebars = require("handlebars");
const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const UserError = require("../userError");
const email = require("../email");
const i18n = require("../i18n");

class PasswordResetRequest extends TaskHandlerBase {
    async run(storeName, _, args) {
        if (args == null || !args.email) {
            throw new UserError("Invalid args. Must be email:string");
        }

        const { entries: commonSettings } = await configStore.getStoreDesc("_commonSettings");
        const { entries: serverSettings } = await configStore.getStoreDesc("_serverSettings");
        if (commonSettings.resetPasswordDisabled) {
            throw new UserError("password reset disabled");
        }

        let user;
        return this.db
            .get(
                "users",
                {
                    $or: [{ login: { $iRegexp: `^${args.email}$` } }, { email: { $iRegexp: `^${args.email}$` } }],
                    isActive: true,
                },
                { noPopulate: true }
            )
            .then((_user) => {
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
            .catch((err) => {
                throw new Error(i18n.get("_commonSettings.signIn.userNotFound"));
            })
            .then((_user) => {
                user = _user;
                return fs.readLib("templates/password-reset-email.html");
            })
            .then((template) => {
                const url = `${commonSettings.baseUrl}/app/?token=${user._passwordResetToken}#reset-password`;
                const body = handlebars.compile(template)({ user: user, url: url, commonSettings: commonSettings });
                const message = {
                    subject: `${i18n.get("_commonSettings.sendResetLink.emailSubject")} ${commonSettings.title} `,
                    to: user.email,
                    body: body,
                };
                return email.send(message);
            })
            .catch((err) => {
                console.error("[PasswordResetRequest] error", err);
                throw err;
            });
    }
}

const passwordResetRequest = new PasswordResetRequest();
module.exports = passwordResetRequest;
