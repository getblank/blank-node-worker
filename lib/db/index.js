"use strict";

// options is the object with such struct:
// {
//      user: Object – user to check permissions and pass to the itemLifeCycle hooks
//      userId: string – if user prop was not provided, it will be taken from db by userId
//      noCheckPermissions: bool – if true, will not check permissions to make db request
//      noRunHooks: bool – if true, will not run itemLifeCycle hooks
//      noValidate: bool – if true, will not run validation
//      noEmitUpdate: bool – if true, will not emit db event
//      noPopulate: bool
//      noLoadVirtualProps: bool
// }

var db = require("./rawDb");
var configStore = require("../configStore");
var mutex = require("../mutex");
var uuid = require("node-uuid");
var EventEmitter = require("events");
var auth = require("../auth");

class Db extends EventEmitter {
    constructor() {
        super();
        this.del = this.delete.bind(this);
        this.setup = db.setup.bind(db);
    }

    waitForConnection() {
        return db.waitForConnection;
    }

    delete(_id, storeName, options = {}, cb) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (!_id || !storeName) {
            cb("Invalid args");
        }

        var user, item;
        this.getUser("system").then(_user => {
            user = _user;
            let storeDesc = configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                throw new Error("Store not found");
            }
            if (!auth.hasDeleteAccess(storeDesc.access, user)) {
                throw new Error("Unauthorized");
            }
            return new Promise((resolve, reject) => {
                db.get(_id, storeName, (err, res) => {
                    options.debug && console.log("DB.get id:", _id, "res:", res, "err", err);
                    if (res == null || res._deleted) {
                        reject("Item not found");
                    } else {
                        resolve(res);
                    }
                });
            });
        }).then(_item => {
            item = _item;
            options.debug && console.log("Item to delete:", item);
            item._deleted = true;
            return this._runHook(storeName, "willRemove", user, item);
        }).then(() => {
            db._set(item._id, `${storeName}_deleted`, item, (err, res) => {
                if (err) { return cb(err) }
                db._delete(item._id, storeName, (err) => {
                    cb(err);
                    this.emit("delete", storeName, item);
                    options.debug && console.log("Before didRemove hook:", item);
                    this._runHook(storeName, "didRemove", user, item);
                });
            });
        }).catch((e) => {
            options.debug && console.log("Delete error:", e);
            cb(e);
        });

        return d;
    }

    find(request, storeName, options = {}, cb) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        this.getUser(options.user || options.userId || "system", (err, user) => {
            if (err) {
                return cb(err);
            }
            let storeDesc = configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                return cb(new Error("Store not found"), null);
            }
            if (!options.noCheckPermissions && !auth.hasReadAccess(storeDesc.access, user)) {
                return cb(new Error("Unauthorized"), null);
            }
            let filters = storeDesc.filters || {};
            request.query = request.query || {};
            let accessQuery = configStore.getMongoAccessQuery(storeName, user);
            if (accessQuery != null) {
                request.query = {
                    "$and": [request.query, accessQuery],
                };
            }

            for (let _queryName of Object.keys(request.query || {})) {
                let filter = filters[_queryName];
                if (!filter || !filter.query) {
                    continue;
                }
                if (typeof filter.query === "function") {
                    try {
                        var calculatedQuery = filter.query(request.query[_queryName]);
                    } catch (err) {
                        console.error("Error when calculating", err);
                    }
                } else {
                    calculatedQuery = db._compileQuery(filter.query, request.query[_queryName]);
                }
                request.query.$and = request.query.$and || [];
                request.query.$and.push(calculatedQuery);
                delete request.query[_queryName];
            }
            db.find(request, storeName, (err, res) => {
                if (err) {
                    return cb(err, null);
                }
                if (res.items.length > 0) {
                    let promises = [];
                    for (let i = 0; i < res.items.length; i++) {
                        promises.push(this._populateAndLoadVirtual(res.items[i], storeName, storeDesc, user, options));
                    }
                    Promise.all(promises).then(() => cb(null, res)).catch(err => cb(err, null));
                    return;
                }
                cb(null, res);
            });
        });

        return d;
    }

    get(_id, storeName, options = {}, cb) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 0`);
        this.getUser(options.user || options.userId || "system", (err, user) => {
            options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 1: found user`);
            let config = configStore.getConfig(options.user);
            let storeDesc = config[storeName];
            if (!storeDesc) {
                return cb(new Error("Store not found"), null);
            }
            if (!options.noCheckPermissions && !auth.hasReadAccess(storeDesc.access, user)) {
                return cb(new Error("Unauthorized"), null);
            }

            options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 1: will find document in db`);
            db.get(_id, storeName, (err, item) => {
                options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 2: result from db received.`);
                if (err && err.message === "Not found") {
                    options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 2.1: item not found. Will look in the "${storeName}_deleted" store.`);
                    return db.get(_id, `${storeName}_deleted`, (err, item) => {
                        options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 2.2: result from "${storeName}_deleted" store received.`);
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

        return d;
    }

    insert(item, storeName, options = {}, cb) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        item._id = this.newId();
        let noEmitUpdate = options.noEmitUpdate;
        options.noEmitUpdate = true;

        this.set(item, storeName, options, (err, $item) => {
            if (err) {
                return cb(err, null);
            }
            if (!noEmitUpdate) {
                this.emit("create", storeName, $item, null);
            }
            cb(null, $item);
        });

        return d;
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
                        if (_item[propName]) {
                            load(_item[propName], _item, propDesc.props);
                        }
                        break;
                    case "objectList": {
                        let propValue = _item[propName];
                        if (propValue) {
                            for (let i = 0; i < (propValue || []).length; i++) {
                                let subItem = propValue[i];
                                load(subItem, _item, propDesc.props);
                            }
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
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (!configStore.isStore(storeName)) {
            return cb(new Error("Store not found"), null);
        }
        db.rawFindOneAndUpdate({ _id: storeName }, { $inc: { sequence: 1 } }, "_sequences", (err, res) => {
            if (err) {
                return cb(err, null);
            }
            cb(null, res.sequence);
        });

        return d;
    }

    nextSequenceString(storeName, stringLength, cb) {
        if (typeof stringLength === "function") {
            cb = stringLength;
            stringLength = 6;
        }
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        this.nextSequence(storeName, (err, res) => {
            if (err) {
                return cb(err, res);
            }
            res += "";
            let zeros = "0000000000000000";
            res = zeros.slice(0, stringLength - res.length) + res;
            cb(null, res);
        });

        return d;
    }

    notify(receivers, storeName, message, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

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

        return d;
    }

    populateAll(item, storeName, user, cb) {
        var store;
        if (typeof storeName === "string") {
            let config = configStore.getConfig(user);
            store = config[storeName];
            if (!store) {
                let err = new Error("Store not found");
                cb(err, null);
                return Promise.reject(err);
            }
        } else {
            store = storeName;
        }
        return this._populateAll(item, store, user, cb);
    }

    set(item, storeName, options = {}, cb) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
        // options.debug = true;
        if (!item._id) {
            cb(new Error("No _id provided"), null);
            return d;
        }
        let user, storeDesc, unlock, newItem = null, prevItem = null, insert = false;
        this.getUser(options.user || options.userId || "system").then((_user) => {
            options.debug && console.log("User loaded:", _user);
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
            this._prepareItem(storeDesc.props, newItem);
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
            unlock = null;
            this._updateRefs(storeName, savedItem, prevItem);
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

        return d;
    }

    setDangerously(item, storeName, cb = () => { }) {
        let options = { noValidate: true };
        return this.set(item, storeName, options, cb);
    }

    getUser(userId, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
        if (typeof userId === "object") {
            cb(null, userId);
            return d;
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
                        cb(null, null);
                    } else {
                        cb(null, {
                            "_id": userId,
                            "roles": ["root"],
                        });
                    }
                } else {
                    db.get(userId, "users", cb);
                }
                break;
        }
        return d;
    }

    _prepareItem(props, item) {
        for (let p of Object.keys(item)) {
            if (p === "__v") {
                continue;
            }
            let propDesc = props[p];
            if (!propDesc) {
                delete item[p];
                continue;
            }
            switch (propDesc.type) {
                case "int":
                case "float":
                    item[p] = item[p] * 1;
                    break;
                case "string":
                    item[p] = item[p] + "";
                    break;
                case "object":
                    this._prepareItem(propDesc.props, item[p]);
                    break;
                case "objectList":
                    for (let i = 0; i < (item[p] || []).length; i++) {
                        this._prepareItem(propDesc.props, item[p][i]);
                    }
                    break;
                case "date":
                    // TODO: Decide: May be need to convert date to string or vice versa
                    break;
                case "password":
                    if (typeof item[p] === "string" && item[p].length > 0) {
                        let pass = {};
                        pass.salt = this.newId();
                        pass.key = require("../hash").calcSync(item[p], pass.salt);
                        item[p] = pass;
                    }
                    break;
            }
        }
    }

    _runHook(storeName, hookName, arg1, arg2, arg3) {
        let hookFn = configStore.getItemEventHandler(storeName, hookName) || emptyHook;
        return hookFn(arg1, arg2, arg3);
    }

    _updateRefs(storeName, item, prevItem) {
        let refPairs = configStore.getStoreRefPairs(storeName);
        for (let p of refPairs) {
            this._syncRefPair(item, prevItem, p.ref, p.oppositeStoreName, p.oppositeRef);
        }
    }

    _syncRefPair(item, prevItem, ref, oppositeStoreName, oppositeRef) {
        let prevValue, value;
        if (ref.type === "ref") {
            prevValue = (prevItem && prevItem[ref.prop]) ? [prevItem[ref.prop]] : [];
            value = item[ref.prop] ? [item[ref.prop]] : [];
        } else {
            prevValue = prevItem ? prevItem[ref.prop] || [] : [];
            value = item[ref.prop] || [];
        }

        let added = value.filter(v => prevValue.indexOf(v) < 0),
            deleted = prevValue.filter(v => value.indexOf(v) < 0);
        for (let id of deleted) {
            this.__updateLinkRef(oppositeStoreName, oppositeRef, id, item._id, true);
        }
        for (let id of added) {
            this.__updateLinkRef(oppositeStoreName, oppositeRef, id, item._id);
        }
    }

    __updateLinkRef(storeName, ref, refItemId, linkId, remove) {
        this.get(refItemId, storeName, (e, d) => {
            if (d == null || d._deleted) {
                return;
            }
            let data = remove ? this.__removeLinkFromRef(ref, d, linkId) : this.__addLinkToRef(ref, d, linkId);
            if (data) {
                this.set(data, storeName, { "noRunHooks": true });
            }
        });
    }

    __addLinkToRef(ref, refItem, addId) {
        let data;
        if (ref.type === "ref" && refItem[ref.prop] !== addId) {
            data = { "_id": refItem._id };
            data[ref.prop] = addId;
        }
        if (ref.type === "refList" && (refItem[ref.prop] || []).indexOf(addId) < 0) {
            data = { "_id": refItem._id };
            data[ref.prop] = refItem[ref.prop] || [];
            data[ref.prop].push(addId);
        }
        return data;
    }

    __removeLinkFromRef(ref, refItem, removeId) {
        let data;
        if (ref.type === "ref" && refItem[ref.prop] === removeId) {
            data = { "_id": refItem._id };
            data[ref.prop] = null;
        }
        if (ref.type === "refList") {
            let removeIdIndex = (refItem[ref.prop] || []).indexOf(removeId);
            if (removeIdIndex >= 0) {
                data = { "_id": refItem._id };
                data[ref.prop] = refItem[ref.prop] || [];
                data[ref.prop].splice(removeIdIndex, 1);
            }
        }
        return data;
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
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (!options.noPopulate) {
            this.populateAll(item, storeDesc, user, (err, item) => {
                if (err) {
                    return cb(err, item);
                }
                if (!options.noLoadVirtualProps) {
                    this.loadVirtualProps(item, storeName, storeDesc);
                }
                return cb(null, item);
            });
            return;
        }
        if (!options.noLoadVirtualProps) {
            this.loadVirtualProps(item, storeName, storeDesc);
        }
        cb(null, item);

        return d;
    }

    _validate() { }
}

function emptyHook() { }

let $db = new Db();
module.exports = $db;