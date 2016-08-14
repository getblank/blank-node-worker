"use strict";

let fs = require("fs");
let uuid = require("node-uuid");
let moment = require("moment");
let TaskHandlerBase = require("./TaskHandlerBase");
let configStore = require("../configStore");
let UserError = require("../userError");
let email = require("../email");
let handlebars = require("handlebars");
let errUserExists = new UserError("user exists");
let errActivationNotEnabled = new Error("activation is not enabled");

function readFile(path) {
    return new Promise((resolve, reject) => {
        fs.readFile(path, (err, data) => {
            if (err) {
                return reject(err);
            }
            resolve(data);
        });
    });
}

class SignUp extends TaskHandlerBase {
    run(storeName, _, args, cb) {
        if (args == null || !args.email || !args.password) {
            return cb(new UserError("Invalid args. Must be email:string and password:string at least"), null);
        }
        let commonSettings = configStore.getStoreDesc("_commonSettings").entries;
        let serverSettings = configStore.getStoreDesc("_serverSettings").entries;
        if (commonSettings.signUpDisabled) {
            return cb(new UserError("signup disabled"));
        }
        let user;
        let newUser = args;
        this.db.get({ "$or": [{ login: newUser.email }, { email: newUser.email }] }, "users", { "noPopulate": true }).then(() => {
            throw errUserExists;
        }).catch(err => {
            if (err === errUserExists) {
                throw err;
            }
        }).then(() => {
            if (commonSettings.userActivation) {
                newUser._activationToken = commonSettings.userActivation ? uuid.v4() : undefined;
                let now = new moment();
                if (commonSettings.userActivationTimeout) {
                    let timeout = commonSettings.userActivationTimeout.split(":");
                    let hours = timeout[0].trim() * 1;
                    let minutes = timeout[1] ? timeout[1].trim() * 1 : 0;
                    now.add(hours, "hours");
                    now.add(minutes, "minutes");
                } else {
                    now.add(1, "hours");
                }
                newUser.activationExpires = now;
            }
            return this.db.insert(newUser, "users");
        }).then(_user => {
            user = _user;
            if (!commonSettings.userActivation) {
                throw errActivationNotEnabled;
            }
            if (commonSettings.userActivation) {
                user.activationUrl = `${commonSettings.baseUrl}/hooks/users/activation/${user.activationToken}`;
                delete user.password;
                if (serverSettings.activationEmailTemplate) {
                    return readFile(serverSettings.activationEmailTemplate);
                }
            }
        }).then(template => {
            let body = handlebars.compile(template)({ "user": user, "commonSettings": commonSettings });
            let message = {
                "subject": `${commonSettings.title} activation`,
                "to": user.email,
                "body": body,
            };
            return email.send(message);
        }).then(() => {
            cb(null, null);
        }).catch(err => {
            if (err === errActivationNotEnabled) {
                return cb(null, null);
            }
            cb(err, null);
        });
    }
}
let signUp = new SignUp();
module.exports = signUp;
