"use strict";

// options is the object with such struct:
// {
//      user: Object – user to check permissions and pass to the itemLifeCycle hooks
//      userId: string – if user prop was not provided, it will be taken from db by userId
//      noCheckPermissions: bool – if true, will not check permissions to make db request
//      noRunHooks: bool – if true, will not run itemLifeCycle hooks
//      noValidate: bool – if true, will not run validation
//      noEmitUpdate: bool – if true, will not emit db event
// }

import db from "./rawDb";
import configStore from "../configStore";
import uuid from "node-uuid";
import EventEmitter from "events";
import auth from "../auth";
import userScriptRequire from "../userScriptRequire";

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
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        item._id = this.newId();
        options.noEmitUpdate = true;
        console.log(item, options, cb);
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
            options = {};
        }
        if (!item._id) {
            return cb(new Error("No _id provided"), null);
        }
        this._getUser(options.user || options.userId || "system", (err, user) => {
            if (err) {
                return cb(err, null);
            }
            options.user = user;
            let config = configStore.getConfig(options.user);
            let storeDesc = config[store];
            if (!storeDesc) {
                return cb(new Error("Store not found"), null);
            }
            if (storeDesc.type === "single" && item._id !== "store") {
                return cb(new Error("Invalid _id for single store"), null);
            }
            if (!options.noCheckPermissions && !auth.hasUpdateAccess(storeDesc.access, user)) {
                return cb(new Error("Unauthorized"), null);
            }
            db.get(item._id, store, (err, data) => {
                var newItem = false;
                if (!data) {
                    data = {};
                    newItem = true;
                }
                let prevItem = JSON.parse(JSON.stringify(data));
                err = db._mergeItems(data, item);
                if (err) {
                    return cb(err, null);
                }
                let willHook = configStore.getItemEventHandler(store, newItem ? "willCreate" : "willSave") || emptyHook;
                let willHookResult = willHook(this, userScriptRequire, user, data, prevItem);
                if (typeof willHookResult === "string") {
                    return cb(new Error(willHookResult), null);
                }

                let set = (_id, store, item, cb) => {
                    db._set(item._id, store, data, (err) => {
                        if (err) {
                            return cb(err, null);
                        }
                        if (!options.noEmitUpdate) {
                            this.emit("update", store, data, null);
                        }
                        cb(null, data);
                        let didHook = configStore.getItemEventHandler(store, newItem ? "didCreate" : "didSave") || emptyHook;
                        didHook(this, userScriptRequire, user, data, prevItem);
                    });
                };

                if (willHookResult instanceof Promise) {
                    willHookResult.then((res) => {
                        set(item._id, store, data, cb);
                    }, (err) => {
                        cb(err, null);
                    });
                    return;
                }

                set(item._id, store, data, cb);
            });
        });
    }

    setDangerously(item, store, cb) { }

    _getUser(userId, cb) {
        if (typeof userId === "object") {
            return cb(null, userId);
        }
        setTimeout(() => {
            switch (userId) {
                case "system":
                    cb(null, {
                        "_id": userId,
                        "roles": ["system"],
                    });
                    break;
                case "root":
                    cb(null, {
                        "_id": userId,
                        "roles": ["root"],
                    });
                    break;
                case "guest":
                    cb(null, {
                        "_id": userId,
                        "roles": ["guest"],
                    });
                    break;
                default:
                    if (process.env.NODE_ENV === "test") {
                        return cb(null, {
                            "_id": userId,
                            "roles": ["root"],
                        });
                    }
                    db.get(userId, "users", cb);
                    break;
            }
        });
    }

    _validate() { }
}

function emptyHook () {}

let $db = new Db();
module.exports = $db;