"use strict";

var EventEmitter = require("events");
let $db = require("./db");
let configStore = require("./configStore");

class UsersCache extends EventEmitter {
    constructor() {
        super();
        this.cache = {};
    }

    get(userId) {
        return this.__get(userId);
    }

    getUser(userId) {
        return this.__get(userId, "user");
    }

    getConfig(userId) {
        return this.__get(userId, "config");
    }

    __get(userId, part) {
        if (this.cache[userId]) {
            return Promise.resolve(part ? this.cache[userId][part] : this.cache[userId]);
        } else {
            return this.update(userId).then(() => {
                if (this.cache[userId]) {
                    return part ? this.cache[userId][part] : this.cache[userId];
                }
                throw new Error("Attempt to get unknown user data, userId:", userId, "data:", part);
            });
        }
    }

    update(userId) {
        console.debug("[UsersCache] updating user:", userId);
        return $db.get(userId, "users").then(u => {
            this.cache[userId] = {};
            this.cache[userId].user = u;
            this.cache[userId].config = configStore.getConfig(u);
        });
    }
}

var usersCache = new UsersCache();
module.exports = usersCache;