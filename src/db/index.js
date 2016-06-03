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
import mutex from "../mutex";
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
                            return this._populateAndLoadVirtual(item, storeName, storeDesc, user, options, cb);
                        }
                        return cb(err, item);
                    });
                }
                if (err == null) {
                    return this._populateAndLoadVirtual(item, storeName, storeDesc, user, options, cb);
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
        let user, storeDesc, unlock, newItem = null, prevItem = null, insert = false;
        this.getUser(options.user || options.userId || "system").then((_user) => {
            user = _user;
            storeDesc = configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                throw new Error("Store not found");
            }
            if (storeDesc.type === "single" && item._id !== storeName) {
                throw new Error("Invalid _id for single store");
            }
            if (!options.noCheckPermissions && !auth.hasUpdateAccess(storeDesc.access, user)) {
                throw new Error("Unauthorized");
            }
            return mutex.lock(item._id);
        }).then((_unlock) => {
            options.debug && console.log("Mutex entered!");
            unlock = _unlock;
            return new Promise((resolve) => {
                db.get(item._id, storeName, (err, res) => {
                    resolve(res);
                });
            });
        }).then((_prevItem) => {
            options.debug && console.log("Prev item loaded:", _prevItem);
            prevItem = _prevItem;
            insert = !prevItem;
            newItem = JSON.parse(JSON.stringify(prevItem || {}));
            let err = db._mergeItems(newItem, item);
            if (err) {
                throw err;
            }
            if (options.noRunHooks) {
                return Promise.resolve();
            }
            return this._runHook(storeName, insert ? "willCreate" : "willSave", user, newItem, prevItem);
        }).then(() => {
            options.debug && console.debug("Hook completed, ready to save");
            let version = insert ? 0 : (newItem.__v || null);
            delete newItem.__v;
            if (insert) {
                newItem.createdAt = new Date();
                newItem.createdBy = user._id;
                newItem._ownerId = newItem._ownerId || user._id;
            } else {
                newItem.updatedAt = new Date();
                newItem.updatedBy = user._id;
                delete newItem._id;
            }
            let findQuery = { _id: item._id };
            if (version !== 0) {
                findQuery.__v = version;
            }
            let updateQuery = {
                "$set": newItem,
                "$inc": { __v: 1 },
            };
            return db.rawFindOneAndUpdate(findQuery, updateQuery, storeName);
        }).then((savedItem) => {
            options.debug && console.log("Item saved in DB! Result:", savedItem);
            unlock();
            this._updateRefs(storeName, storeDesc, savedItem, prevItem);
            return new Promise((resolve, reject) => {
                this._populateAndLoadVirtual(savedItem, storeName, storeDesc, user, options, (err, item) => {
                    err == null ? resolve(item) : reject(err);
                });
            });
        }).then((fullItem) => {
            if (!options.noEmitUpdate) {
                this.emit("update", storeName, fullItem, null);
            }
            cb(null, fullItem);
            if (options.noRunHooks) {
                return;
            }
            this._runHook(storeName, insert ? "didCreate" : "didSave", user, fullItem, prevItem);
        }).catch((e) => {
            options.debug && console.log("$db.set error:", e);
            if (typeof unlock === "function") {
                unlock();
            }
            cb(e, null);
        });
    }

    setDangerously(item, storeName, cb = () => { }) {
        let options = { noValidate: true };
        return this.set(item, storeName, options, cb);
    }

    getUser(userId, cb) {
        let defer;
        if (typeof cb !== "function") {
            defer = new Promise((resolve, reject) => {
                cb = (e, r) => { (e == null) ? resolve(r) : reject(e) };
            });
        }
        if (typeof userId === "object") {
            return cb(null, userId);
        }
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
        return defer;
    }

    _runHook(storeName, hookName, arg1, arg2, arg3) {
        let hookFn = configStore.getItemEventHandler(storeName, hookName) || emptyHook;
        let hookResult = hookFn(arg1, arg2, arg3);
        if (typeof hookResult === "string") {
            throw new Error(hookResult);
        }
        return (hookResult instanceof Promise ? hookResult : Promise.resolve());
    }

    _updateRefs(storeName, storeDesc, item, prevItem) {
        let refPairs = configStore.getStoreRefPairs(storeName);
        for (let p of refPairs.ref_ref) {
            this._syncRefToRef(item, prevItem, p.ref.prop, p.oppositeStoreName, p.oppositeRef.prop);
        }
    }

    _syncRefToRef(item, prevItem, propName, oppositeStoreName, oppositePropName) {
        if (prevItem[propName] === item[propName]) {
            return;
        }
        if (prevItem[propName]) {
            let prevOpposite = { "_id": prevItem[propName] };
            prevOpposite[oppositePropName] = null;
            this.set(prevOpposite, oppositeStoreName, {"noRunHooks": true});
        }
        let opposite = { "_id": item[propName] };
        opposite[oppositePropName] = null;
        this.set(opposite, oppositeStoreName, {"noRunHooks": true});
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

    _populateAndLoadVirtual(item, storeName, storeDesc, user, options, cb) {
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