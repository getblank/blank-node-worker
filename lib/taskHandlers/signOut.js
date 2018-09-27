"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class SignOut extends TaskHandlerBase {
    async run(storeName, user, args) {
        const { auth } = (await configStore.getStoreDesc("_serverSettings")).entries;
        const { willSignOut } = auth;
        if (!willSignOut) {
            return;
        }

        return willSignOut(this.db, user, args);
    }
}

const signOut = new SignOut();
module.exports = signOut;
