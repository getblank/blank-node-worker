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

    async __get(userId, part) {
        if (this.cache[userId]) {
            return part ? this.cache[userId][part] : this.cache[userId];
        }

        await this.update(userId);
        if (this.cache[userId]) {
            return part ? this.cache[userId][part] : this.cache[userId];
        }

        throw new Error("Attempt to get unknown user data, userId:", userId, "data:", part);
    }

    async update(userId) {
        console.debug("[UsersCache] updating user:", userId);
        try {
            const user =
                (await userId) === "guest" ? { _id: "guest", roles: ["guest"] } : await $db.get("users", userId);
            if (user && !user._deleted) {
                this.cache[userId] = {};
                this.cache[userId].user = user;
                this.cache[userId].config = await configStore.getConfig(user);
            }
        } catch (err) {
            console.error("UsersCache.update error", err);
        }
    }
}

const usersCache = new UsersCache();
module.exports = usersCache;
