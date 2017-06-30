"use strict";
// TODO: rewrite this module with async/await

// options is the object with such struct:
// {
//      user: Object – user to check permissions and pass to the itemLifeCycle hooks
//      userId: string – if user prop was not provided, it will be taken from db by userId
//      noCheckPermissions: bool – if true, will not check permissions to make db request
//      noRunHooks: bool – if true, will not run itemLifeCycle hooks
//      noValidate: bool – if true, will not run validation
//      noEmitUpdate: bool – if true, will not emit db event
//      upsert: bool – if false, will not insert new document in $db.set
//      noPopulate: bool
//      noLoadVirtualProps: bool
//      drop: bool – only for delete. If true, will not move document in _deleted collection. Only delete document.
//      deleted: bool – only for get. If true, will search in _deleted collections too.
//      timeout: integer – only for find now. Timeout for query in ms.
//      returnNull: bool – only for get. Will return null without error if item not found
//      props: Array<string> – only for get. Will return selected props only + _id
// }

const db = require("./rawDb");
const configStore = require("../configStore");
const sync = require("../sync");
const uuid = require("uuid");
const EventEmitter = require("events");
const auth = require("../auth");
const validation = require("validation").default;
const iso8601 = /^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[\+-][012]\d\:[012]\d)$/;
///^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d/;
const cloneDeep = require("lodash.clonedeep");
const jsonpatch = require("fast-json-patch");

class Db extends EventEmitter {
    constructor() {
        super();
        this.del = this.delete.bind(this);
        this.setup = db.setup.bind(db);
        this.mongo = db;
    }

    waitForConnection() {
        return db.waitForConnection;
    }

    async count(storeName, query, options) {
        const request = { query, count: 0 };
        const res = await this.find(storeName, request, options);

        return res.count;
    }

    delete(storeName, _id, options = {}, cbk) {
        if (typeof options === "function") {
            cbk = options;
            options = {};
        }
        const d = (typeof cbk !== "function") ? new Promise((f, r) => (cbk = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        if (!_id || !storeName) {
            cbk(new Error("Invalid args"));
            return d;
        }

        var user, item;
        let p = options.user ? Promise.resolve(options.user) : this.getUser(options.userId || "system");
        p.then(_user => {
            user = _user;
            let storeDesc = configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                throw new Error("Store not found");
            }
            if (!auth.hasDeleteAccess(storeDesc.access, user)) {
                throw new Error("Unauthorized");
            }
            if (storeDesc.type === "notification" && options.drop == null) {
                options.drop = true;
            }
            return new Promise((resolve, reject) => {
                db.get(storeName, _id, (err, res) => {
                    options.debug && console.log("DB.get id:", _id, "res:", res, "err", err);
                    if (res == null || res._deleted) {
                        reject("not found");
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
            if (options.drop) {
                db._delete(storeName, item._id, (err) => {
                    cbk(err);
                    this.emit("delete", storeName, item);
                    options.debug && console.log("Before didRemove hook:", item);
                    this._runHook(storeName, "didRemove", user, item);
                });
                return;
            }
            db._set(`${storeName}_deleted`, item._id, item, (err, res) => {
                if (err) {
                    return cbk(err);
                }
                db._delete(storeName, item._id, (err) => {
                    cbk(err);
                    this.emit("delete", storeName, item);
                    options.debug && console.log("Before didRemove hook:", item);
                    this._runHook(storeName, "didRemove", user, item);
                });
            });
        }).catch((e) => {
            options.debug && console.log("Delete error:", e);
            cbk(e);
        });

        return d;
    }

    find(storeName, request, options = {}, _cb) {
        if (typeof options === "function") {
            _cb = options;
            options = {};
        }
        const d = (typeof _cb !== "function") ? new Promise((f, r) => (_cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        const baseDebugMessage = `Store ${storeName}. Request ${JSON.stringify(request)}, options: ${JSON.stringify(options)}.`;
        console.debug(`[$db][find] init. ${baseDebugMessage}`);

        let timeout;
        let cbCalled = false;
        const cb = (err, res) => {
            if (cbCalled) {
                return;
            }

            cbCalled = true;
            clearTimeout(timeout);
            _cb(err, res);
        };
        let _timeout = options.timeout || 10000;
        let now = Date.now();
        timeout = setTimeout(() => {
            console.warn(`[$db][find] long query execution ${Date.now() - now}ms. ${baseDebugMessage}`);
            if (options.timeout) {
                return cb(new Error("long query execution"));
            }
        }, _timeout);

        let p = options.user ? Promise.resolve(options.user) : this.getUser(options.userId || "system");
        p.then(async (user) => {
            console.debug(`[$db][find] user found. ${baseDebugMessage}`);
            let storeDesc = configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                console.debug(`[$db][find] Store not found. ${baseDebugMessage}`);
                return cb(new Error("Store not found"), null);
            }
            if (!options.noCheckPermissions && !auth.hasReadAccess(storeDesc.access, user)) {
                console.debug(`[$db][find] Unauthorized by store permissions. ${baseDebugMessage}`);
                return cb(new Error("Unauthorized"), null);
            }
            let readableProps = configStore.getReadablePropsForUser(storeDesc, user);
            if (Object.keys(readableProps).length === 0) {
                console.debug(`[$db][find] Unauthorized by props permissions. ${baseDebugMessage}`);
                return cb(new Error("Unauthorized"), null);
            }
            let filters = storeDesc.filters || {};
            request.query = request.query || {};

            for (let _queryName of Object.keys(request.query || {})) {
                let filter = filters[_queryName];
                if (!filter || !filter.query) {
                    this._validateQueryPart(request.query[_queryName]);
                    continue;
                }

                let calculatedQuery;
                if (typeof filter.query === "function") {
                    try {
                        calculatedQuery = filter.query(request.query[_queryName]);
                        if (calculatedQuery instanceof Promise) {
                            calculatedQuery = await calculatedQuery;
                        }
                    } catch (err) {
                        console.error(`[$db][find] query "${_queryName}" evaluating error`, err);
                    }
                } else {
                    calculatedQuery = db._compileQuery(filter.query, request.query[_queryName]);
                }

                request.query.$and = request.query.$and || [];
                if (calculatedQuery) {
                    request.query.$and.push(calculatedQuery);
                }

                delete request.query[_queryName];
            }
            let accessQuery = configStore.getMongoAccessQuery(storeName, user);
            if (accessQuery != null) {
                request.query.$and = (request.query.$and || []).concat([accessQuery]);
            }
            console.debug(`[$db][find] query calculated: ${JSON.stringify(request)}. ${baseDebugMessage}`);
            db.find(storeName, request, (err, res) => {
                if (err) {
                    console.debug(`[$db][find] find error: ${err}. ${baseDebugMessage}`);
                    return cb(err, null);
                }
                if (res.items.length > 0) {
                    return this._populateAndLoadVirtual(storeName, res.items, storeDesc, user, options)
                        .then(() => {
                            console.debug(`[$db][find] populated. ${baseDebugMessage}`);
                            for (let i = 0; i < res.items.length; i++) {
                                res.items[i] = this._copyReadableItemProps(readableProps, res.items[i]);
                            }
                            console.debug(`[$db][find] complete. ${baseDebugMessage}`);
                            cb(null, res);
                        })
                        .catch(err => {
                            console.debug(`[$db][find] populating error ${err}. ${baseDebugMessage}`);
                            cb();
                        });
                }
                console.debug(`[$db][find] complete. ${baseDebugMessage}`);
                cb(null, res);
            });
        })
            .catch(err => {
                console.debug(`[$db][find] user find error ${err}. ${baseDebugMessage}`);
                cb();
            });

        return d;
    }

    forEach(storeName, query, options, itemCb, cb) {
        if (typeof options === "function") {
            cb = itemCb;
            itemCb = options;
            options = {};
        }

        if (typeof itemCb !== "function") {
            throw new Error("Invalid args");
        }
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        const p = options.user ? Promise.resolve(options.user) : this.getUser(options.userId || "system");
        p.then(user => {
            let storeDesc = configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                throw new Error("Store not found");
            }
            if (!auth.hasReadAccess(storeDesc.access, user)) {
                throw new Error("Unauthorized");
            }
            let filters = storeDesc.filters || {};
            for (let _queryName of Object.keys(query || {})) {
                let filter = filters[_queryName];
                if (!filter || !filter.query) {
                    continue;
                }
                if (typeof filter.query === "function") {
                    try {
                        var calculatedQuery = filter.query(query[_queryName]);
                    } catch (err) {
                        console.error("Error when calculating", err);
                    }
                } else {
                    calculatedQuery = db._compileQuery(filter.query, query[_queryName]);
                }
                query.$and = query.$and || [];
                query.$and.push(calculatedQuery);
                delete query[_queryName];
            }
            let accessQuery = configStore.getMongoAccessQuery(storeDesc, user);
            if (accessQuery != null) {
                query.$and = (query.$and || []).concat([accessQuery]);
            }
            db.forEach(storeName, query, itemCb, cb);
        }).catch((e) => {
            options.debug && console.log("Delete error:", e);
            cb(e);
        });

        return d;
    }

    get(storeName, _id, options = {}, cb) {
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        if (typeof options === "function") {
            cb = options;
            options = {};
        }

        const query = typeof _id === "string" ? { _id } : _id;
        options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 0`);
        this.getUser(options.user || options.userId || "system", (err, user) => {
            if (err) {
                return cb(err);
            }

            options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 1: found user`);
            let config = configStore.getConfig(options.user);
            let storeDesc = config[storeName];
            if (!storeDesc) {
                return cb(options.returnNull ? null : new Error("Store not found"), null);
            }

            if (!options.noCheckPermissions && !auth.hasReadAccess(storeDesc.access, user)) {
                return cb(new Error("Unauthorized"), null);
            }

            let readableProps = configStore.getReadablePropsForUser(storeDesc, user);
            if (!Object.keys(readableProps).length === 0) {
                return cb(new Error("Unauthorized"), null);
            }

            options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 1: will find document in db`);
            let item;
            let p;
            if (Object.keys(query).length === 2 && query._id && query.__v) {
                p = this._getArchivedItem(storeName, query);
            } else {
                p = db.get(storeName, _id, options);
            }

            return p
                .catch(err => {
                    if (err.message === "Not found" && options.deleted) {
                        options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 2.1: item not found. Will look in the "${storeName}_deleted" store.`);
                        return db.get(`${storeName}_deleted`, _id);
                    }

                    throw err;
                })
                .then(res => {
                    item = res;
                    options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 2: result from db received.`);

                    return this._populateAndLoadVirtual(storeName, item, storeDesc, user, options);
                })
                .then(res => {
                    res = this._copyReadableItemProps(readableProps, item);
                    cb(null, res);
                })
                .catch(err => {
                    if (err.message === "Not found" && options.returnNull) {
                        err = null;
                    }

                    cb(err, item);
                });
        });

        return d;
    }

    insert(storeName, item, options = {}, cb) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        this.newId(storeName, null, item)
            .then(res => {
                item._id = res;
                const noEmitUpdate = options.noEmitUpdate;
                options.noEmitUpdate = true;

                this.set(storeName, item, options, (err, $item) => {
                    if (err) {
                        return cb(err, null);
                    }
                    if (!noEmitUpdate) {
                        const createdItem = JSON.parse(JSON.stringify($item));
                        this.emit("create", storeName, createdItem, null);
                    }

                    cb(null, $item);
                });
            })
            .catch(err => cb(err));

        return d;
    }

    loadVirtualProps(storeName, item, storeDesc) {
        storeDesc = storeDesc || configStore.getStoreDesc(storeName);
        const load = (_item, baseItem, props) => {
            for (let propName of Object.keys(props)) {
                const propDesc = props[propName];
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
        if (Array.isArray(item)) {
            item.forEach((_item) => {
                load(_item, null, storeDesc.props);
            });

            return;
        }
        load(item, null, storeDesc.props);
    }

    newId(storeName, storeDesc, item) {
        if (!storeName) {
            return uuid.v4();
        }

        const fn = async () => {
            storeDesc = storeDesc || configStore.getStoreDesc(storeName);
            if (!storeDesc) {
                throw new Error(`Store ${storeName} not found`);
            }

            const load = storeDesc.props["_id"].load;
            const _id = await load(this, item);

            return _id;
        };

        return fn();
    }

    nextSequence(sequenceId, cb) {
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        db.rawFindOneAndUpdate("_sequences", { _id: sequenceId }, { $inc: { sequence: 1 } }, true, (err, res) => {
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
        if (!stringLength) {
            stringLength = 6;
        }
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        this.nextSequence(storeName, (err, res) => {
            if (err) {
                return cb(err, res);
            }

            const zeros = "0000000000000000";
            res += "";
            res = zeros.slice(0, stringLength - res.length) + res;
            cb(null, res);
        });

        return d;
    }

    notify(storeName, receivers, message, cb) {
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        if (typeof message === "string") {
            message = {
                event: "notification",
                level: "info",
                message: message,
            };
        }

        if (typeof receivers === "string") {
            receivers = [receivers];
        }

        const all = [];
        const now = new Date();
        const expireAt = message.ttl ? new Date(now.setSeconds(now.getSeconds() + message.ttl)) : null;
        for (let receiver of receivers) {
            const m = {
                _id: this.newId(),
                _ownerId: receiver,
                event: message.event,
                level: message.level,
                message: message.message,
                details: message.details,
                relatedObjects: message.relatedObjects,
            };
            if (expireAt) {
                m.expireAt = expireAt;
            }

            all.push(this.set(storeName, m));
        }
        Promise.all(all).then(res => cb(null)).catch(e => cb(e));

        return d;
    }

    populateAll(storeName, item, user, cb) {
        var store;
        if (typeof storeName === "string") {
            const config = configStore.getConfig(user);
            store = config[storeName];
            if (!store) {
                let err = new Error("Store not found");
                cb(err, null);
                return Promise.reject(err);
            }
        } else {
            store = storeName;
        }
        return this._populateAll(store, item, user, cb);
    }

    set(storeName, item, options = {}, cbk) {
        console.debug(`[$db][set] request to set item ${item._id} to store ${storeName}`);
        if (typeof options === "function") {
            cbk = options;
            options = {};
        }

        const d = (typeof cbk !== "function") ? new Promise((f, r) => (cbk = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        if (!item._id) {
            console.debug("[$db][set] ERROR: no _id provided");
            cbk(new Error("No _id provided"), null);
            return d;
        }

        let user, storeDesc, unlock, newItem = null, prevItem = null, insert = false;
        this.getUser(options.user || options.userId || "system").then((_user) => {
            console.debug("[$db][set] user loaded:", _user);
            user = _user;
            storeDesc = configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                console.debug(`[$db][set] ERROR: store not found ${storeName}`);
                throw new Error("Store not found");
            }
            if (storeDesc.type === "single" && item._id !== storeName) {
                console.debug(`[$db][set] ERROR: invalid _id ${item._id} for single store ${storeName}`);
                throw new Error("Invalid _id for single store");
            }
            if (!options.noCheckPermissions && !auth.hasUpdateAccess(storeDesc.access, user)) {
                console.debug(`[$db][set] ERROR: unauthorized user ${user._id} for store ${storeName}`);
                throw new Error("Unauthorized");
            }
            return sync.lock(item._id);
        }).then((_unlock) => {
            console.debug(`[$db][set] mutex locked ${item._id}`);
            unlock = _unlock;
            return db.get(storeName, item._id)
                .catch(() => null); // because it can be no saved item
        }).then((_prevItem) => {
            console.debug("[$db][set] prev item loaded:", _prevItem);
            prevItem = _prevItem;
            insert = !prevItem;
            newItem = JSON.parse(JSON.stringify(prevItem || {}));
            let err = db._mergeItems(newItem, item);
            if (err) {
                console.debug(`[$db][set] ERROR: on merging for store ${storeName}`, err);
                throw err;
            }
            this._prepareItem(storeDesc.props, newItem, insert, user);
            if (options.noRunHooks) {
                console.debug(`[$db][set] no need to run hooks for ${newItem._id} for store ${storeName}`);
                return Promise.resolve();
            }
            return this._runHook(storeName, insert ? "willCreate" : "willSave", user, newItem, prevItem && JSON.parse(JSON.stringify(prevItem)));
        }).then(() => {
            console.debug(`[$db][set] hooks completed for ${newItem._id} for store ${storeName}, ready to save`);
            let version = newItem.__v || null;
            delete newItem.__v;
            if (insert) {
                newItem.createdAt = new Date();
                newItem.createdBy = user._id;
                newItem._ownerId = newItem._ownerId || user._id;
            } else {
                newItem.updatedAt = new Date();
                newItem.updatedBy = user._id;
            }

            const storeDesc = configStore.getStoreDesc(storeName, user);
            if (!options.noValidate) {
                let validationResult = validation.validate(storeDesc, newItem, null, user);
                if (Object.keys(validationResult || {}).length > 0) {
                    console.debug(`[$db][set] VALIDATION ERROR for ${newItem._id} for store ${storeName}`, storeName, "/", newItem._id, JSON.stringify(validationResult, null, "  "));
                    throw new Error(`${storeName}.${newItem._id} validation failed`);
                }
            }

            if (insert) {
                newItem.__v = 1;
                return db.insert(storeName, newItem);
            }

            delete newItem._id;
            let findQuery = { _id: item._id };
            if (version) {
                findQuery.__v = version;
            }

            let updateQuery = {
                $set: newItem,
                $inc: { __v: 1 },
            };
            return db.rawFindOneAndUpdate(storeName, findQuery, updateQuery, options.upsert !== false);
        }).then((savedItem) => {
            console.debug("[$db][set] item saved in DB! Result:", savedItem);
            unlock();
            unlock = null;
            this._updateRefs(storeName, savedItem, prevItem);

            return this._populateAndLoadVirtual(storeName, savedItem, storeDesc, user, options);
        }).then((fullItem) => {
            console.debug(`[$db][set] populated item ${fullItem._id} for store ${storeName}`);
            if (!options.noEmitUpdate) {
                this.emit("update", storeName, JSON.parse(JSON.stringify(fullItem)), prevItem && JSON.parse(JSON.stringify(prevItem)));
            }
            let readableProps = configStore.getReadablePropsForUser(storeDesc, user);
            let res = this._copyReadableItemProps(readableProps, fullItem);
            cbk(null, res);
            if (!insert && storeDesc.logging) {
                this._logItem(storeDesc, fullItem, prevItem, user);
            }

            if (options.noRunHooks) {
                return;
            }
            this._runHook(storeName, insert ? "didCreate" : "didSave", user, cloneDeep(fullItem), prevItem && cloneDeep(prevItem));
        }).then(() => {
            console.debug(`[$db][set] completed item for store ${storeName}`);
        }).catch((e) => {
            console.debug("$db.set error:", e);
            if (typeof unlock === "function") {
                unlock();
            }
            cbk(e, null);
        });

        return d;
    }

    setDangerously(storeName, item, cb = () => { }) {
        const options = { noValidate: true };
        return this.set(storeName, item, options, cb);
    }

    getUser(userId, cbk) {
        const d = (typeof cbk !== "function") ? new Promise((f, r) => (cbk = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        if (typeof userId === "object") {
            cbk(null, userId);
            return d;
        }
        switch (userId) {
            case "system":
                cbk(null, {
                    _id: userId,
                    roles: ["system"],
                });
                break;
            case "root":
                cbk(null, {
                    _id: userId,
                    roles: ["root"],
                });
                break;
            case "guest":
                cbk(null, {
                    _id: userId,
                    roles: ["guest"],
                });
                break;
            default:
                db.get("users", userId, (err, user) => {
                    if (err) {
                        if (process.env.NODE_ENV === "test") {
                            if (userId === "UNKNOWN") {
                                cbk(null, null);
                            } else {
                                cbk(null, {
                                    _id: userId,
                                    roles: ["root"],
                                });
                            }
                        } else {
                            cbk(err, null);
                        }
                    } else {
                        cbk(null, user);
                    }
                });
                break;
        }
        return d;
    }

    _copyReadableItemProps(readableProps, source) {
        const res = {};
        for (let prop in readableProps) {
            if (source[prop] == null) {
                continue;
            }
            if (readableProps[prop] === true) {
                res[prop] = source[prop];
            } else if (typeof readableProps[prop] === "object") {
                const subValue = source[prop];
                if (Array.isArray(subValue)) {
                    res[prop] = [];
                    for (let subItem of subValue) {
                        res[prop].push(this._copyReadableItemProps(readableProps[prop], subItem));
                    }
                    continue;
                }
                if (subValue) {
                    res[prop] = this._copyReadableItemProps(readableProps[prop], subValue);
                }
            }
        }
        return res;
    }

    _getArchivedItem(storeName, query) {
        const archiveQuery = {
            query: {
                itemId: query._id,
                prevVer: { $gte: query.__v },
            },
            orderBy: "-prevVer",
            take: 10000,
            props: ["reverseDiff"],
        };

        let item;
        return db.get(storeName, query._id)
            .then(res => {
                item = res;
                return db.get(`${storeName}_log`, { itemId: query._id, prevVer: query.__v });
            })
            .then(res => {
                return db.rawFindAll(`${storeName}_log`, archiveQuery);
            })
            .then(res => {
                for (let diff of res) {
                    jsonpatch.apply(item, diff.reverseDiff);
                }

                return item;
            });
    }

    _logItem(storeDesc, item, prevItem) {
        const diff = jsonpatch.compare(prevItem, item);
        const reverseDiff = jsonpatch.compare(item, prevItem);

        const logRecord = {
            diff,
            reverseDiff,
            _id: this.newId(),
            itemId: item._id,
            ver: item.__v,
            prevVer: prevItem.__v,
            createdAt: item.updatedAt,
            createdBy: item.updatedBy,
        };

        return db.rawFindOneAndUpdate(`${storeDesc.name}_log`, { _id: logRecord._id }, logRecord, true);
    }

    _prepareItem(props, item, fillDefault, user) {
        for (let p of Object.keys(item)) {
            if (p === "__v") {
                continue;
            }

            const propDesc = props[p];
            if (!propDesc) {
                delete item[p];
                continue;
            }

            if (item[p] == null) {
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
                    this._prepareItem(propDesc.props, item[p], fillDefault, user);
                    break;
                case "objectList":
                    for (let i = 0; i < (item[p] || []).length; i++) {
                        this._prepareItem(propDesc.props, item[p][i], fillDefault, user);
                    }
                    break;
                case "date":
                    if (typeof item[p] === "string" && iso8601.test(item[p])) {
                        item[p] = new Date(item[p]);
                    }
                    break;
                case "password":
                    if (typeof item[p] === "string" && item[p].length > 0) {
                        const pass = {};
                        pass.salt = this.newId();
                        pass.key = require("../hash").calcSync(item[p], pass.salt);
                        pass.hashed = true;
                        item[p] = pass;
                    }
                    break;
                case "virtual":
                    delete item[p];
                    break;
            }
        }
        if (fillDefault) {
            for (let p of Object.keys(props)) {
                if (props[p].default != null && item[p] == null) {
                    if (typeof props[p].default === "function") {
                        item[p] = props[p].default(item, user, require("../i18n"));
                    } else {
                        item[p] = props[p].default;
                    }
                }
            }
        }
    }

    _runHook(storeName, hookName, arg1, arg2, arg3) {
        const hookFn = configStore.getItemEventHandler(storeName, hookName) || emptyHook;
        return hookFn(arg1, arg2, arg3);
    }

    _updateRefs(storeName, item, prevItem) {
        const refPairs = configStore.getStoreRefPairs(storeName);
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

        const added = value.filter(v => prevValue.indexOf(v) < 0);
        const deleted = prevValue.filter(v => value.indexOf(v) < 0);
        for (let id of deleted) {
            this.__updateLinkRef(oppositeStoreName, oppositeRef, id, item._id, true);
        }
        for (let id of added) {
            this.__updateLinkRef(oppositeStoreName, oppositeRef, id, item._id);
        }
    }

    __updateLinkRef(storeName, ref, refItemId, linkId, remove) {
        this.get(storeName, refItemId, (err, res) => {
            if (err) {
                return console.error(`[__updateLinkRef] Can't find pair in store ${storeName}, refItemId: ${refItemId}`, err);
            }

            if (res == null || res._deleted) {
                return;
            }

            const data = remove ? this.__removeLinkFromRef(ref, res, linkId) : this.__addLinkToRef(ref, res, linkId);
            if (data) {
                this.set(storeName, data, { noRunHooks: true }, (err) => {
                    if (err) {
                        console.error("Can't set pair", err);
                    }
                });
            }
        });
    }

    __addLinkToRef(ref, refItem, addId) {
        let data;
        if (ref.type === "ref" && refItem[ref.prop] !== addId) {
            data = { _id: refItem._id };
            data[ref.prop] = addId;
        }
        if (ref.type === "refList" && (refItem[ref.prop] || []).indexOf(addId) < 0) {
            data = { _id: refItem._id };
            data[ref.prop] = refItem[ref.prop] || [];
            data[ref.prop].push(addId);
        }
        return data;
    }

    __removeLinkFromRef(ref, refItem, removeId) {
        let data;
        if (ref.type === "ref" && refItem[ref.prop] === removeId) {
            data = { _id: refItem._id };
            data[ref.prop] = null;
        }
        if (ref.type === "refList") {
            const removeIdIndex = (refItem[ref.prop] || []).indexOf(removeId);
            if (removeIdIndex >= 0) {
                data = { _id: refItem._id };
                data[ref.prop] = refItem[ref.prop] || [];
                data[ref.prop].splice(removeIdIndex, 1);
            }
        }
        return data;
    }

    _populateAll(store, _item, $user, cb) {
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        const itemsProcessors = [];
        const itemsCache = {};

        let itemProcessor = (item) => {
            let p = () => {
                return new Promise((resolve) => {
                    if (!store.props) {
                        return resolve(item);
                    }

                    const all = [];
                    const keys = Object.keys(store.props);
                    if (keys.length === 0) {
                        return resolve(item);
                    }

                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        const prop = store.props[key];
                        let refList = false;
                        switch (prop.type) {
                            case "refList":
                                refList = true;
                            // fallthrough
                            case "ref":
                                if (!prop.populateIn) {
                                    continue;
                                }
                                break;
                            default:
                                continue;
                        }

                        if (!item[key]) {
                            item[prop.populateIn.prop] = null;
                            continue;
                        }
                        itemsCache[prop.store] = itemsCache[prop.store] || {};

                        const refKeys = refList ? item[key] : [item[key]];
                        for (let refKey of refKeys) {

                            const p = () => {
                                return new Promise((resolve) => {
                                    if (itemsCache[prop.store][refKey]) {
                                        if (refList) {
                                            item[prop.populateIn.prop] = item[prop.populateIn.prop] || [];
                                            item[prop.populateIn.prop].push(itemsCache[prop.store][refKey]);
                                        } else {
                                            item[prop.populateIn.prop] = itemsCache[prop.store][refKey];
                                        }

                                        return resolve();
                                    }
                                    if (prop.store === "users") {
                                        this.getUser(refKey, (err, data) => {
                                            if (err) {
                                                console.error(`When populating in store ${store.name} itemId: ${item._id}. refStore: "${prop.store}", refId: "${refKey}"`, err);
                                                return resolve();
                                            }

                                            data = prop.populateIn.fn ? prop.populateIn.fn(data) : data;
                                            if (refList) {
                                                item[prop.populateIn.prop] = item[prop.populateIn.prop] || [];
                                                item[prop.populateIn.prop].push(data);
                                            } else {
                                                item[prop.populateIn.prop] = data;
                                            }

                                            itemsCache[prop.store][refKey] = data;
                                            resolve();
                                        });
                                    } else {
                                        db.get(prop.store, refKey, (err, data) => {
                                            if (err) {
                                                console.error(`When populating in store ${store.name} itemId: ${item._id}. refStore: "${prop.store}", refId: "${refKey}"`, err);
                                                return resolve();
                                            }

                                            data = prop.populateIn.fn ? prop.populateIn.fn(data) : data;
                                            if (refList) {
                                                item[prop.populateIn.prop] = item[prop.populateIn.prop] || [];
                                                item[prop.populateIn.prop].push(data);
                                            } else {
                                                item[prop.populateIn.prop] = data;
                                            }

                                            itemsCache[prop.store][refKey] = data;
                                            resolve();
                                        });
                                    }
                                });
                            };
                            all.push(p);
                        }
                    }

                    Promise.series(all).then(() => { resolve(item) });
                });
            };
            itemsProcessors.push(p);
        };

        if (Array.isArray(_item)) {
            _item.forEach(itemProcessor);
        } else {
            itemProcessor(_item);
        }

        Promise.series(itemsProcessors).then(res => cb(null, _item));
        return d;
    }

    _populateAndLoadVirtual(storeName, item, storeDesc, user, options, cb) {
        const d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        if (!options.noPopulate) {
            this.populateAll(storeDesc, item, user, (err, item) => {
                if (err) {
                    return cb(err, item);
                }
                if (!options.noLoadVirtualProps) {
                    try {
                        this.loadVirtualProps(storeName, item, storeDesc);
                    } catch (err) {
                        console.error("[$db][_populateAndLoadVirtual] error", err);
                        return cb(err, item);
                    }
                }
                return cb(null, item);
            });
            return d;
        }

        let err;
        if (!options.noLoadVirtualProps) {
            this.loadVirtualProps(storeName, item, storeDesc);
            try {
                this.loadVirtualProps(storeName, item, storeDesc);
            } catch (e) {
                err = e;
                console.error("[$db][_populateAndLoadVirtual] error", err);
            }
        }

        cb(err, item);
        return d;
    }

    _validateQueryPart(part) {
        if (part === null) {
            return;
        }
        if (Array.isArray(part)) {
            for (let p of part) {
                this._validateQueryPart(p);
            }
            return;
        }
        if (typeof part === "object") {
            for (let key of Object.keys(part)) {
                if (typeof part[key] === "object" || Array.isArray(part[key])) {
                    this._validateQueryPart(part[key]);
                    continue;
                }
                if (typeof part[key] === "string" && iso8601.test(part[key])) {
                    part[key] = new Date(part[key]);
                }
            }
        }
    }
}

function emptyHook() { }

let $db = new Db();
module.exports = $db;