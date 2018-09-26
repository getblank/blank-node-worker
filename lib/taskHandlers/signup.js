"use strict";

const crypto = require("crypto");
const fs = require("fs");
const uuid = require("uuid");
const moment = require("moment");
const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");
const UserError = require("../userError");
const email = require("../email");
const handlebars = require("handlebars");
const errUserExists = new UserError("user exists");
const errActivationNotEnabled = new Error("activation is not enabled");

class SignUp extends TaskHandlerBase {
    async run(storeName, _, args, cb) {
        if (args == null || !args.email || (!args.password && !args.hashedPassword)) {
            return cb(new UserError("Invalid args. Must be email:string and password:string at least"), null);
        }

        const commonSettings = (await configStore.getStoreDesc("_commonSettings")).entries;
        if (commonSettings.signUpDisabled) {
            return cb(new UserError("signup disabled"));
        }

        let user;
        const newUser = {
            email: args.email,
            login: args.email,
            password: args.hashedPassword
                ? args.hashedPassword
                : crypto
                      .createHash("md5")
                      .update(args.password)
                      .digest("hex"),
        };
        const redirectUrl = newUser.redirectUrl;
        delete newUser.redirectUrl;
        this.db
            .get("users", { $or: [{ login: newUser.email }, { email: newUser.email }] }, { noPopulate: true })
            .then(() => {
                throw errUserExists;
            })
            .catch(err => {
                if (err === errUserExists) {
                    throw err;
                }
            })
            .then(() => {
                if (commonSettings.userActivation) {
                    newUser._activationToken = uuid.v4();

                    const now = new moment();
                    if (commonSettings.userActivationTimeout) {
                        let timeout = (commonSettings.userActivationTimeout + "").split(":");
                        let hours = timeout[0].trim() * 1;
                        let minutes = timeout[1] ? timeout[1].trim() * 1 : 0;
                        now.add(hours, "hours");
                        now.add(minutes, "minutes");
                    } else {
                        now.add(1, "hours");
                    }

                    newUser._activationExpires = now.toDate();
                    newUser.isActive = false;
                }
                return this.db.insert("users", newUser);
            })
            .then(_user => {
                user = _user;
                if (Object.keys(args).length > 2) {
                    delete args.email;
                    delete args.password;
                    return this.db.insert("profile", Object.assign({}, args, { _ownerId: user._id }), {
                        noValidate: true,
                    });
                }
            })
            .then(() => {
                if (!commonSettings.userActivation) {
                    throw errActivationNotEnabled;
                }

                if (commonSettings.userActivation) {
                    delete user.password;

                    return fs.readLib("templates/activation-email.html");
                }
            })
            .then(template => {
                let url = `${commonSettings.baseUrl}/hooks/users/activation/${user._activationToken}`;
                if (redirectUrl) {
                    url += `?redirectUrl=${redirectUrl}`;
                }

                const body = handlebars.compile(template)({ user: user, url: url, commonSettings: commonSettings });
                const message = {
                    subject: `${commonSettings.title} activation`,
                    to: user.email,
                    body: body,
                };

                return email.send(message);
            })
            .then(() => {
                cb(null, user._id);
            })
            .catch(err => {
                if (err === errActivationNotEnabled) {
                    return cb(null, user._id);
                }

                cb(err, null);
            });
    }
}

const signUp = new SignUp();
module.exports = signUp;
