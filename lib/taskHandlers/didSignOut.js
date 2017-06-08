"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class DidSignOut extends TaskHandlerBase {
    run(storeName, user, args, cb) {
        const { auth } = configStore.getStoreDesc("_serverSettings").entries;
        const { didSignOut } = auth;
        if (!didSignOut) {
            return cb();
        }

        return didSignOut(this.db, user, args)
            .then(res => cb(null, res))
            .catch(err => cb(err));
    }
}

const didSignOut = new DidSignOut();
module.exports = didSignOut;
