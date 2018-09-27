"use strict";

const crypto = require("crypto");
const TaskHandlerBase = require("./TaskHandlerBase");
const hash = require("../hash");
const UserError = require("../userError");
const configStore = require("../configStore");
const request = require("request");
const i18n = require("../i18n");

class Authentication extends TaskHandlerBase {
    async run(storeName, user, args) {
        if (args == null || (!args.social && !(args.login && (args.password || args.hashedPassword)))) {
            throw new UserError("Invalid args. Must be login:string and (password:string or hashedPassword:string)");
        }
        switch (args.social) {
            case "facebook":
                return this._fbLogin(args);
            default:
                return this._baseLogin(args);
        }
    }

    _clearPrivateUserData(user) {
        delete user.password;
        delete user.activationToken;
        delete user.passwordResetToken;
    }

    async _runHooks(auth, args, user) {
        if (auth.willSignIn) {
            return auth.willSignIn(this.db, user, args).then(() => {
                if (auth.didSignIn) {
                    process.nextTick(() => auth.didSignIn(this.db, user, args));
                }

                return auth.createToken(this.db, user, null, args);
            });
        }

        if (auth.didSignIn) {
            process.nextTick(() => auth.didSignIn(this.db, user, args));
        }

        return auth.createToken(this.db, user, args);
    }

    async _baseLogin(args) {
        const { auth } = (await configStore.getStoreDesc("_serverSettings")).entries;
        const { findUser, checkPassword } = auth;
        const { login, password } = args;
        let { hashedPassword } = args;
        const getUser = findUser
            ? findUser(this.db, args)
            : this.db.get("users", { $or: [{ login }, { email: login }] }, { returnNull: true });
        let user;
        return getUser
            .then(res => {
                user = res;
                if (!user || (!user.isActive && login !== "root")) {
                    throw new UserError(i18n.get("_commonSettings.signIn.userNotFound"));
                }

                if (checkPassword) {
                    return checkPassword(user, args);
                }
            })
            .then(async res => {
                if (res === true) {
                    this._clearPrivateUserData(user);
                    return this._runHooks(auth, args, user);
                }

                if (
                    typeof user.password !== "object" ||
                    user.password == null ||
                    !user.password.salt ||
                    !user.password.key
                ) {
                    throw new UserError(i18n.get("_commonSettings.signIn.invalidUserData"));
                }

                if (!hashedPassword) {
                    hashedPassword = crypto
                        .createHash("md5")
                        .update(password)
                        .digest("hex");
                }

                let key = new Buffer(hashedPassword);
                key = await hash.calc(key, user.password.salt);
                if (user.password.key != key) {
                    throw new UserError(i18n.get("_commonSettings.signIn.invalidPassword"));
                }

                this._clearPrivateUserData(user);

                return this._runHooks(auth, args, user);
            });
    }

    async _fbLogin(args, cbk) {
        const { code } = args;
        console.debug("[facebook auth] code:", code);
        const commonSettings = (await configStore.getStoreDesc("_commonSettings")).entries;
        const serverSettings = (await configStore.getStoreDesc("_serverSettings")).entries;
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

                this.db
                    .get("users", { $or: [{ facebookId: body.id }, { email: body.email }] })
                    .then(user => {
                        console.debug("[facebook auth] user found:", user._id);
                        if (user.facebookId != null) {
                            return user;
                        }
                        console.debug(
                            `[facebook auth] user found by email: ${body.email} ${user._id}. Will attach facebookId ${
                                body.id
                            }`
                        );
                        return this.db.set("users", { _id: user._id, facebookId: body.id });
                    })
                    .then(user => {
                        delete user.password;
                        delete user.activationToken;
                        delete user.passwordResetToken;
                        cbk(null, user);
                        throw stop;
                    })
                    .catch(err => {
                        if (err === stop) {
                            throw err;
                        }
                        if (err.message !== "Not found") {
                            cbk(err);
                            throw stop;
                        }
                        console.debug("[facebook auth] this is a new user:", body.id);
                        return this.db.insert("users", {
                            facebookId: body.id,
                            email: body.email,
                            login: body.email,
                            isActive: true,
                            noPassword: true,
                        });
                    })
                    .then(user => {
                        createdUser = user;
                        console.debug("[facebook auth] user created:", user.facebookId, user._id);
                        delete user.password;
                        delete user.activationToken;
                        delete user.passwordResetToken;
                        return this.db.insert(
                            "profile",
                            { _ownerId: user._id, name: body.first_name, lastName: body.last_name, login: user.login },
                            { noValidate: true }
                        );
                    })
                    .then(() => {
                        cbk(null, createdUser);
                    })
                    .catch(err => {
                        if (err === stop) {
                            return;
                        }
                        cbk(err);
                    });
            });
        });
    }
}

const authentication = new Authentication();
module.exports = authentication;
