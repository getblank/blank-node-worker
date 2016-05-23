"use strict";

import db from "./rawDb";
import configStore from "../configStore";
import uuid from "node-uuid";
import EventEmitter from "events";

class Db extends EventEmitter {
    constructor() {
        super();
        this.del = this.delete.bind(this);
        this.setup = db.setup.bind(db);
    }

    delete(_id, store, cb) { }

    find(request, store, options = {}, cb = () => { }) {
        if (typeof options === "function") {
            cb = options;
        }
        let storeDesc = configStore.getStoreDesc(store);
        if (!storeDesc) {
            return cb("Store not found");
        }
        let filters = storeDesc.filters || {};
        request.query = request.query || {};

        for (let _queryName of Object.keys(request.query || {})) {
            let filter = filters[_queryName];
            if (!filter || !filter.query) {
                continue;
            }
            let calculatedQuery = db._compileQuery(filter.query, request.query[_queryName]);
            request.query.$and = request.query.$and || [];
            request.query.$and.push(calculatedQuery);
            delete request.query[_queryName];
        }

        db.find(request, store, cb);
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

    insert(item, store, options = {}, cb = () => { }) {
        item._id = this.newId();
        options.noEmitUpdate = true;
        return this.set(item, store, options, (err, $item) => {
            if (err) {
                return cb(err, null);
            }
            this.emit("create", store, item, null);
            cb(null, $item);
        });
    }

    loadVirtualProps(item, store, cb) { }

    newId() {
        return uuid.v4();
    }

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
        db.get(item._id, store, (err, data) => {
            data = data || {};
            err = db._mergeItems(data, item);
            if (err) {
                return cb(err, null);
            }
            db._set(item._id, store, data, (err) => {
                if (err) {
                    return cb(err, null);
                }
                if (!options.noEmitUpdate) {
                    this.emit("update", store, data, null);
                }
                cb(null, data);
            });
        });
    }

    setDangerously(item, store, cb) { }
}

let $db = new Db();
module.exports = $db;