"use strict";

// options is the object with such struct:
// {
//      user: Object – user to check permissions and pass to the itemLifeCycle hooks
//      userId: string – if user prop was not provided, it will be taken from db by userId
//      noCheckPermissions: bool – if true, will not check permissions to make db request
//      noRunHooks: bool – if true, will not run itemLifeCycle hooks
//      noValidate: bool – if true, will not run validation
//      noEmitUpdate: bool – if true, will not emit db event
//      populate: bool
//      loadVirtualProps: bool
//      maxAttempts: 3 – number of attempts to save document with version control
// }

import db from "./rawDb";
import configStore from "../configStore";
import uuid from "node-uuid";
import EventEmitter from "events";
import auth from "../auth";

class Db extends EventEmitter {
    constructor() {
        super();
        this.del = this.delete.bind(this);
        this.setup = db.setup.bind(db);
        let _set = this.set.bind(this);
        this.set = function (item, storeName, options = {}, cb = () => { }) {
            if (typeof options === "function") {
                cb = options;
                options = {};
            }
            return new Promise((resolve, reject) => {
                _set(item, storeName, options, (e, d) => {
                    if (e != null) {
                        reject(e);
                    } else {
                        resolve(d);
                    }
                    cb(e, d);
                });
            });
        };
    }

    delete(_id, storeName, cb = () => { }) {
        this.getUser("system", (err, user) => {
            if (err) {
                return cb(err, null);
            }
            let storeDesc = configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                return cb(new Error("Store not found"), null);
            }
            if (!auth.hasDeleteAccess(storeDesc.access, user)) {
                return cb(new Error("Unauthorized"), null);
            }
            db.get(_id, storeName, (err, item) => {
                if (err) {
                    if (err.message === "Not found") {
                        return cb(null);
                    }
                    return cb(err);
                }
                item._deleted = true;
                let willHook = configStore.getItemEventHandler(storeName, "willRemove") || emptyHook;
                let willHookResult = willHook(user, item, null);
                if (typeof willHookResult === "string") {
                    return cb(new Error(willHookResult), null);
                }

                let del = () => {
                    db._set(item._id, `${storeName}_deleted`, item, (err, res) => {
                        if (err) {
                            return cb(err);
                        }
                        db._delete(item._id, storeName, (err) => {
                            cb(err);
                            this.emit("delete", storeName, _id, null);
                            let didHook = configStore.getItemEventHandler(storeName, "didRemove") || emptyHook;
                            didHook(user, item, null);
                        });
                    });
                };

                if (willHookResult instanceof Promise) {
                    willHookResult.then((res) => {
                        del();
                    }, (err) => {
                        cb(err);
                    });
                    return;
                }

                del();
            });
        });
    }

    find(request, storeName, options = {}, cb = () => { }) {
        if (typeof options === "function") {
            cb = options;
        }
        let storeDesc = configStore.getStoreDesc(storeName);
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

        db.find(request, storeName, cb);
    }

    get(_id, storeName, options = {}, cb = () => { }) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        this.getUser(options.user || options.userId || "system", (err, user) => {
            let config = configStore.getConfig(options.user);
            let storeDesc = config[storeName];
            if (!storeDesc) {
                return cb(new Error("Store not found"), null);
            }
            if (!options.noCheckPermissions && !auth.hasReadAccess(storeDesc.access, user)) {
                return cb(new Error("Unauthorized"), null);
            }

            db.get(_id, storeName, (err, item) => {
                if (err && err.message === "Not found") {
                    return db.get(_id, `${storeName}_deleted`, (err, item) => {
                        if (err == null) {
                            return this._populateAndVirtualing(item, storeName, storeDesc, user, options, cb);
                        }
                        return cb(err, item);
                    });
                }
                if (err == null) {
                    return this._populateAndVirtualing(item, storeName, storeDesc, user, options, cb);
                }
                cb(err, item);
            });
        });
    }

    insert(item, storeName, options = {}, cb = () => { }) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        item._id = this.newId();
        options.noEmitUpdate = true;

        return this.set(item, storeName, options, (err, $item) => {
            if (err) {
                return cb(err, null);
            }
            this.emit("create", storeName, item, null);
            cb(null, $item);
        });
    }

    loadVirtualProps(item, storeName, storeDesc) {
        storeDesc = storeDesc || configStore.getStoreDesc(storeName);
        let load = (_item, baseItem, props) => {
            for (let propName of Object.keys(props)) {
                let propDesc = props[propName];
                switch (propDesc.type) {
                    case "virtual":
                        _item[propName] = propDesc.load(_item, baseItem);
                        break;
                    case "object":
                        load(_item[propName], _item, propDesc.props);
                        break;
                    case "objectList": {
                        let propValue = _item[propName];
                        for (let i = 0; i < (propValue || []).length; i++) {
                            let subItem = propValue[i];
                            load(subItem, _item, propDesc.props);
                        }
                    }
                }
            }
        };
        load(item, null, storeDesc.props);
    }

    newId() {
        return uuid.v4();
    }

    nextSequence(storeName, cb) {
        if (!configStore.isStore(storeName)) {
            return cb(new Error("Store not found"), null);
        }
        db.rawFindOneAndUpdate({ _id: storeName }, { $inc: { sequence: 1 } }, "_sequences", (err, res) => {
            if (err) {
                return cb(err, null);
            }
            cb(null, res.sequence);
        });
    }

    nextSequenceString(storeName, stringLength, cb) {
        cb = cb || stringLength;
        if (typeof stringLength === "function") {
            stringLength = 6;
        }
        this.nextSequence(storeName, (err, res) => {
            if (err) {
                return cb(err, res);
            }
            res += "";
            let zeros = "0000000000000000";
            res = zeros.slice(0, stringLength - res.length) + res;
            cb(null, res);
        });
    }

    notify(receivers, storeName, message, cb = () => { }) {
        if (typeof message === "string") {
            message = {
                "event": "notification",
                "level": "info",
                "message": message,
            };
        }
        if (typeof receivers === "string") {
            receivers = [receivers];
        }
        let all = [];
        for (let receiver of receivers) {
            let m = {
                _id: this.newId(),
                _ownerId: receiver,
                event: message.event,
                level: message.level,
                message: message.message,
            };
            all.push(this.set(m, storeName));
        }
        Promise.all(all).then(res => cb(null)).catch(e => cb(e));
    }

    populateAll(item, storeName, user, cb = () => { }) {
        var store;
        if (typeof storeName === "string") {
            let config = configStore.getConfig(user);
            store = config[storeName];
            if (!store) {
                let err = new Error("Store not found");
                cb(err, null);
                return Promise.reject(err);
            }
        }
        return this._populateAll(item, store, user, cb);
    }

    set(item, storeName, options, cb) {
        if (!item._id) {
            return cb(new Error("No _id provided"), null);
        }
        this.getUser(options.user || options.userId || "system", (err, user) => {
            if (err) {
                return cb(err, null);
            }
            options.user = user;
            let config = configStore.getConfig(options.user);
            let storeDesc = config[storeName];
            if (!storeDesc) {
                return cb(new Error("Store not found"), null);
            }
            if (storeDesc.type === "single" && item._id !== storeName) {
                return cb(new Error("Invalid _id for single store"), null);
            }
            if (!options.noCheckPermissions && !auth.hasUpdateAccess(storeDesc.access, user)) {
                return cb(new Error("Unauthorized"), null);
            }
            let originalItemJSON = JSON.stringify(item);
            let currentAttempt = 0;
            options.maxAttempts = options.maxAttempts || 3;

            let setAttempt = () => {
                item = JSON.parse(originalItemJSON);
                db.get(item._id, storeName, (err, data) => {
                    var newItem = false;
                    if (!data) {
                        data = {};
                        newItem = true;
                    }
                    let version = newItem ? 0 : data.__v || null;
                    let prevItem = JSON.parse(JSON.stringify(data));
                    err = db._mergeItems(data, item);
                    if (err) {
                        return cb(err, null);
                    }
                    if (newItem) {
                        data.createdAt = new Date().toISOString();
                        data.createdBy = user._id;
                        data._ownerId = data._ownerId || user._id;
                    } else {
                        data.updatedAt = new Date().toISOString();
                        data.updatedBy = user._id;
                    }
                    let willHook = configStore.getItemEventHandler(storeName, newItem ? "willCreate" : "willSave") || emptyHook;
                    let willHookResult = willHook(user, data, prevItem);
                    if (typeof willHookResult === "string") {
                        return cb(new Error(willHookResult), null);
                    }

                    let willHookDefer = (willHookResult instanceof Promise ? willHookResult : Promise.resolve());
                    willHookDefer.then(() => {
                        let query = { _id: item._id };
                        if (version !== 0) {
                            query.__v = version;
                        }
                        if (!newItem) {
                            delete data._id;
                        }
                        delete data.__v;
                        data = {
                            "$set": data,
                            "$inc": { __v: 1 },
                        };

                        currentAttempt++;
                        db.rawFindOneAndUpdate(query, data, storeName, (err, res) => {
                            if (err) {
                                if (currentAttempt === options.maxAttempts) {
                                    console.warn("Max set attempts reached", options.maxAttempts);
                                    return cb(err, null);
                                }
                                console.debug("Set attempt failed. Will retry. Attempts remaining", options.maxAttempts - currentAttempt);
                                return setAttempt();
                            }
                            data = res;
                            this._populateAndVirtualing(data, storeName, storeDesc, user, options, (err, item) => {
                                if (!options.noEmitUpdate) {
                                    this.emit("update", storeName, data, null);
                                }
                                cb(null, data);
                                let didHook = configStore.getItemEventHandler(storeName, newItem ? "didCreate" : "didSave") || emptyHook;
                                didHook(user, data, prevItem);
                            });
                        });
                    }, (err) => {
                        cb(err, null);
                    });
                });
            };
            setAttempt();
        });
    }

    setDangerously(item, storeName, cb = () => { }) {
        let options = { noValidate: true };
        return this.set(item, storeName, options, cb);
    }

    getUser(userId, cb) {
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
                        if (userId === "UNKNOWN") {
                            return cb(null, null);
                        } else {
                            return cb(null, {
                                "_id": userId,
                                "roles": ["root"],
                            });
                        }
                    }
                    db.get(userId, "users", cb);
                    break;
            }
        });
    }

    _populateAll(item, store, $user, cb = () => { }) {
        let defer = new Promise((resolve, reject) => {
            if (!store.props) {
                return resolve(item);
            }
            let all = [];
            let keys = Object.keys(store.props);
            if (keys.length === 0) {
                return resolve(item);
            }

            for (let i = 0; i < keys.length; i++) {
                let key = keys[i];
                let prop = store.props[key];
                if (prop.type !== "ref" || !prop.populateIn) {
                    continue;
                }
                if (!item[key]) {
                    continue;
                }
                let p = new Promise((resolve) => {
                    db.get(item[key], prop.store, (err, data) => {
                        if (err) {
                            console.error("When populating", err);
                            return resolve();
                        }
                        item[prop.populateIn] = data;
                        resolve();
                    });
                });
                all.push(p);
            }

            Promise.all(all)
                .then(() => {
                    cb(null, item);
                    resolve(item);
                })
                .catch(err => {
                    cb(err, null);
                    reject(err);
                });
        });

        return defer;
    }

    _populateAndVirtualing(item, storeName, storeDesc, user, options, cb) {
        if (options.populate) {
            this.populateAll(item, storeName, user, (err, item) => {
                if (err) {
                    return cb(err, item);
                }
                if (options.loadVirtualProps) {
                    this.loadVirtualProps(item, storeName, storeDesc);
                }
                return cb(null, item);
            });
        }
        if (options.loadVirtualProps) {
            this.loadVirtualProps(item, storeName, storeDesc);
        }
        cb(null, item);
    }

    _validate() { }
}

function emptyHook() { }

let $db = new Db();
module.exports = $db;