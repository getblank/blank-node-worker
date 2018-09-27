"use strict";

const TaskHandlerBase = require("./TaskHandlerBase");
const configStore = require("../configStore");

class DidSignOut extends TaskHandlerBase {
    async run(storeName, user, args) {
        const { auth } = (await configStore.getStoreDesc("_serverSettings")).entries;
        const { didSignOut } = auth;
        if (!didSignOut) {
            return;
        }

        return didSignOut(this.db, user, args);
    }
}

const didSignOut = new DidSignOut();
module.exports = didSignOut;
