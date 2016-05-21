"use strict";

import db from "./rawDb";
import configStore from "../configStore";

class Db {
    constructor() {
        this.del = this.delete.bind(this);
        this.setup = db.setup.bind(db);
    }

    delete(_id, store, cb) { }

    find(query, store, options = {}, cb = () => { }) {
        if (typeof options === "function") {
            cb = options;
        }
        db.find(query, store, cb);
    }

    get(_id, store, options = {}, cb = () => { }) {
        if (typeof options === "function") {
            cb = options;
        }
        // if (options.user) {
        //     let config = configStore.getConfig(options.user);
        // }
        // let storeDesc = configStore.getStoreDesc(store);
        // if (!storeDesc) {
        //     return cb(new Error("Store not found"), null);
        // }
        db.get(_id, store, cb);
    }

    getAll(store, cb) { }

    getAllForUser(store, cb) { }

    getAllKeys(store, cb) { }

    insert(item, store, cb) { }

    loadVirtualProps(item, store, cb) { }

    newId() { }

    nextSequence(store, cb) { }

    nextSequenceString(store, stringLength, cb) { }

    notify(receivers, store, message) { }

    pushComment(_id, prop, data, store, cb) { }

    set(item, store, options = {}, cb = () => { }) {
        if (typeof options === "function") {
            cb = options;
        }
        if (!item._id) {
            return cb(new Error("No _id provided"), null);
        }
        db._set(item._id, store, item, cb);
    }

    setDangerously(item, store, cb) { }
}

let $db = new Db();
module.exports = $db;