"use strict";

const crypto = require("crypto");
const TaskHandlerBase = require("./TaskHandlerBase");
const hash = require("../hash");
const UserError = require("../userError");
const configStore = require("../configStore");
const request = require("request");

class Authentication extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        if (args == null || !args.social && !(args.login && (args.password || args.hashedPassword))) {
            return cb(new UserError("Invalid args. Must be login:string and (password:string or hashedPassword:string)"), null);
        }
        switch (args.social) {
            case "facebook":
                return this._fbLogin(args, cb);
            default:
                return this._baseLogin(args, cb);
        }
    }

    _clearPrivateUserData(user) {
        delete user.password;
        delete user.activationToken;
        delete user.passwordResetToken;
    }

    _runHooks(auth, args, user, cb) {
        if (auth.willSignIn) {
            return auth.willSignIn(this.db, user, args)
                .then(() => {
                    if (auth.didSignIn) {
                        process.nextTick(() => auth.didSignIn(this.db, user, args));
                    }

                    cb(null, user);
                })
                .catch(err => cb(err));
        }

        if (auth.didSignIn) {
            process.nextTick(() => auth.didSignIn(this.db, user, args));
        }

        return cb(null, user);
    }

    _baseLogin(args, cb) {
        const { auth } = configStore.getStoreDesc("_serverSettings").entries;
        const { findUser, checkPassword } = auth;
        let { login, password, hashedPassword } = args;
        const getUser = findUser ? findUser(this.db, login) : this.db.get("users", { $or: [{ login }, { email: login }] }, { returnNull: true });
        return getUser
            .then(user => {
                if (!user || (!user.isActive && login !== "root")) {
                    return cb(new UserError("User not found"), null);
                }

                if (checkPassword) {
                    try {
                        if (checkPassword(user, password || hashedPassword)) {
                            this._clearPrivateUserData(user);
                            return this._runHooks(auth, args, user, cb);
                        }
                    } catch (err) {
                        console.error("Password checking with _serverSettings.auth.login error", err);
                    }
                }

                if (typeof user.password !== "object" || user.password == null || !user.password.salt || !user.password.key) {
                    return cb(new UserError("Invalid user data, please contact system administrator"), null);
                }

                if (!hashedPassword) {
                    hashedPassword = crypto.createHash("md5").update(password).digest("hex");
                }

                const key = new Buffer(hashedPassword);
                hash.calc(key, user.password.salt, (err, key) => {
                    if (user.password.key != key) {
                        return cb(new UserError("Invalid password"), null);
                    }

                    this._clearPrivateUserData(user);
                    return this._runHooks(auth, args, user, cb);
                });
            })
            .catch(err => {
                cb(err, null);
            });
    }

    _fbLogin(args, cbk) {
        const { code } = args;
        console.debug("[facebook auth] code:", code);
        const commonSettings = configStore.getStoreDesc("_commonSettings").entries;
        const serverSettings = configStore.getStoreDesc("_serverSettings").entries;
        let redirectUri = `${commonSettings.baseUrl}/facebook-login`;
        if (args.redirectUrl) {
            redirectUri += encodeURIComponent(`?redirectUrl=${encodeURIComponent(args.redirectUrl)}`);
        }
        let clientId = commonSettings.facebookClientId;
        let clientSecret = serverSettings.facebookClientSecret;
        let fbUri = "https://graph.facebook.com/oauth/access_token";
        fbUri += `?redirect_uri=${redirectUri}&client_id=${clientId}&client_secret=${clientSecret}&code=${code}`;
        request(fbUri, (err, res, body) => {
            if (err) {
                console.error("[facebook auth] access_token getting error", err);
                return cbk(err);
            }
            if (res.statusCode !== 200) {
                try {
                    body = JSON.parse(body);
                } catch (err) {
                    return cbk(err);
                }
                return cbk(new Error((body.error || {}).message));
            }
            fbUri = `https://graph.facebook.com/me?fields=id,name,email&${body}`;
            request(fbUri, (err, res, body) => {
                if (err) {
                    console.error("[facebook auth] data getting error", err);
                    return cbk(err);
                }
                try {
                    body = JSON.parse(body);
                } catch (err) {
                    return cbk(err);
                }
                if (res.statusCode !== 200) {
                    return cbk(new Error((body.error || {}).message));
                }
                console.debug(JSON.stringify(body, null, "\t"));
                // if (!body.verified) {
                //     return cb(new UserError("account is not verified"));
                // }

                if (!body.email) {
                    return cbk(new UserError("no email in facebook data"));
                }

                let stop = new Error("stop");
                let createdUser;

                this.db.get("users", { $or: [{ facebookId: body.id }, { email: body.email }] }).then(user => {
                    console.debug("[facebook auth] user found:", user._id);
                    if (user.facebookId != null) {
                        return user;
                    }
                    console.debug(`[facebook auth] user found by email: ${body.email} ${user._id}. Will attach facebookId ${body.id}`);
                    return this.db.set("users", { _id: user._id, facebookId: body.id });
                }).then(user => {
                    delete user.password;
                    delete user.activationToken;
                    delete user.passwordResetToken;
                    cbk(null, user);
                    throw stop;
                }).catch(err => {
                    if (err === stop) {
                        throw err;
                    }
                    if (err.message !== "Not found") {
                        cbk(err);
                        throw stop;
                    }
                    console.debug("[facebook auth] this is a new user:", body.id);
                    return this.db.insert("users", { facebookId: body.id, email: body.email, login: body.email, isActive: true, noPassword: true });
                }).then(user => {
                    createdUser = user;
                    console.debug("[facebook auth] user created:", user.facebookId, user._id);
                    delete user.password;
                    delete user.activationToken;
                    delete user.passwordResetToken;
                    return this.db.insert("profile", { _ownerId: user._id, name: body.first_name, lastName: body.last_name, login: user.login }, { noValidate: true });
                }).then(() => {
                    cbk(null, createdUser);
                }).catch(err => {
                    if (err === stop) {
                        return;
                    }
                    cbk(err);
                });
            });
        });
    }
}
let authentication = new Authentication();
module.exports = authentication;