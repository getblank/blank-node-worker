"use strict";

let fs = require("fs");
let uuid = require("node-uuid");
let moment = require("moment");
let TaskHandlerBase = require("./TaskHandlerBase");
let configStore = require("../configStore");
let UserError = require("../userError");
let email = require("../email");
let handlebars = require("handlebars");

class PasswordResetRequest extends TaskHandlerBase {
    run(storeName, _, args, cb) {
        if (args == null || !args.email) {
            return cb(new UserError("Invalid args. Must be email:string"), null);
        }
        let commonSettings = configStore.getStoreDesc("_commonSettings").entries;
        let serverSettings = configStore.getStoreDesc("_serverSettings").entries;
        if (commonSettings.resetPasswordDisabled) {
            return cb(new UserError("password reset disabled"));
        }
        let user;
        this.db.get({ "$or": [{ login: args.email }, { email: args.email }], "isActive": true }, "users", { "noPopulate": true }).then(_user => {
            let now = new moment();
            if (serverSettings.passwordResetTokenExpiration) {
                let timeout = (serverSettings.passwordResetTokenExpiration + "").split(":");
                let hours = timeout[0].trim() * 1;
                let minutes = timeout[1] ? timeout[1].trim() * 1 : 0;
                now.add(hours, "hours");
                now.add(minutes, "minutes");
            } else {
                now.add(1, "hours");
            }
            return this.db.set({ _id: _user._id, _passwordResetExpires: now.toDate(), _passwordResetToken: uuid.v4() }, "users");
        }).catch(err => {
            throw new Error("user not found");
        }).then(_user => {
            user = _user;
            return fs.readLib("templates/password-reset-email.html");
        }).then(template => {
            let url = `${commonSettings.baseUrl}/?token=${user._passwordResetToken}#reset-password`;
            let body = handlebars.compile(template)({ "user": user, "url": url, "commonSettings": commonSettings });
            let message = {
                "subject": `${commonSettings.title} password reset`,
                "to": user.email,
                "body": body,
            };
            return email.send(message);
        }).then(() => {
            cb(null, null);
        }).catch(err => {
            console.error("[PasswordResetRequest] error", err);
            cb(err, null);
        });
    }
}
let passwordResetRequest = new PasswordResetRequest();
module.exports = passwordResetRequest;