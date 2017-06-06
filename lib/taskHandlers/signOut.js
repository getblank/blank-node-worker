"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class SignOut extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        const { auth } = configStore.getStoreDesc("_serverSettings").entries;
        const { willSignOut } = auth;
        if (!willSignOut) {
            return cb();
        }

        return willSignOut(this.db, user)
            .then(res => cb(null, res))
            .catch(err => cb(err));
    }
}

const signOut = new SignOut();
module.exports = signOut;
