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
const filter = require("./filter");
const configStore = require("../configStore");
const sync = require("../sync");
const uuid = require("uuid");
const EventEmitter = require("events");
const auth = require("../auth");
const validation = require("validation").default;
const cloneDeep = require("lodash.clonedeep");
const jsonpatch = require("fast-json-patch");

class DB extends EventEmitter {
    constructor() {
        super();
        this.del = this.delete.bind(this);
        this.setup = db.setup;
        this.mongo = db;
    }

    begin() {
        const $db = new DB();
        $db.mongo = this.mongo.begin();
        $db._tx = true;

        return $db;
    }

    commit() {
        $db._tx = false;

        return this.mongo.commit();
    }

    rollback() {
        if (!$db._tx) {
            return;
        }

        return this.mongo.rollback();
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
        const d =
            typeof cbk !== "function"
                ? new Promise((f, r) => (cbk = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        if (!_id || !storeName) {
            cbk(new Error("Invalid args"));
            return d;
        }

        var user, item;
        let p = options.user ? Promise.resolve(options.user) : this.getUser(options.userId || "system");
        p.then(async _user => {
            user = _user;
            let storeDesc = configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                throw new Error("Store not found");
            }

            if (!(await auth.hasDeleteAccess(storeDesc.access, user))) {
                throw new Error("Unauthorized");
            }

            if (storeDesc.type === "notification" && options.drop == null) {
                options.drop = true;
            }

            // TODO: remove this Promise
            return new Promise((resolve, reject) => {
                this.mongo.get(storeName, _id, (err, res) => {
                    options.debug && console.log("DB.get id:", _id, "res:", res, "err", err);
                    if (res == null || res._deleted) {
                        reject("not found");
                    } else {
                        resolve(res);
                    }
                });
            });
        })
            .then(_item => {
                item = _item;
                options.debug && console.log("Item to delete:", item);
                item._deleted = true;
                return this._runHook(storeName, "willRemove", user, item);
            })
            .then(() => {
                if (options.drop) {
                    this.mongo._delete(storeName, item._id, err => {
                        cbk(err);
                        this.emit("delete", storeName, item);
                        options.debug && console.log("Before didRemove hook:", item);
                        this._runHook(storeName, "didRemove", user, item);
                    });
                    return;
                }
                this.mongo._set(`${storeName}_deleted`, item._id, item, (err, res) => {
                    if (err) {
                        return cbk(err);
                    }
                    this.mongo._delete(storeName, item._id, err => {
                        cbk(err);
                        this.emit("delete", storeName, item);
                        options.debug && console.log("Before didRemove hook:", item);
                        this._runHook(storeName, "didRemove", user, item);
                    });
                });
            })
            .catch(e => {
                options.debug && console.log("Delete error:", e);
                cbk(e);
            });

        return d;
    }

    async find(storeName, request, options = {}) {
        const baseDebugMessage = `Store ${storeName}. Request ${JSON.stringify(request)}, options: ${JSON.stringify(
            options
        )}.`;
        console.debug(`[$db][find] init. ${baseDebugMessage}`);

        const _timeout = options.timeout || 10000;
        const now = Date.now();
        const timeout = setTimeout(() => {
            console.warn(`[$db][find] long query execution ${Date.now() - now}ms. ${baseDebugMessage}`);
            if (options.timeout) {
                throw new Error("long query execution");
            }
        }, _timeout);

        try {
            let user;
            try {
                user = await (options.user ? Promise.resolve(options.user) : this.getUser(options.userId || "system"));
            } catch (err) {
                console.debug(`[$db][find] user find error ${err}. ${baseDebugMessage}`);
                throw err;
            }

            console.debug(`[$db][find] user found. ${baseDebugMessage}`);
            const storeDesc = await configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                console.debug(`[$db][find] Store not found. ${baseDebugMessage}`);
                throw new Error("Store not found");
            }

            if (!options.noCheckPermissions && !(await auth.hasReadAccess(storeDesc.access, user))) {
                console.debug(`[$db][find] Unauthorized by store permissions. ${baseDebugMessage}`);
                throw new Error("Unauthorized");
            }

            const readableProps = await configStore.getReadablePropsForUser(storeDesc, user);
            if (Object.keys(readableProps).length === 0) {
                console.debug(`[$db][find] Unauthorized by props permissions. ${baseDebugMessage}`);
                throw new Error("Unauthorized");
            }

            let res;
            const { dataSource } = storeDesc;
            try {
                if (dataSource) {
                    res = await configStore.getDataSource(storeDesc, this).find(request);
                } else {
                    request.query = await filter.prepare(storeDesc, request.query, user);
                    console.debug(`[$db][find] query calculated: ${JSON.stringify(request)}. ${baseDebugMessage}`);
                    res = await this.mongo.find(storeName, request);
                }
            } catch (err) {
                console.debug(`[$db][find] find error: ${err}. ${baseDebugMessage}`);
                throw err;
            }

            if (res.items.length === 0) {
                console.debug(`[$db][find] complete. ${baseDebugMessage}`);
                return res;
            }

            try {
                await this._populateAndLoadVirtual(storeName, res.items, storeDesc, user, options);
                console.debug(`[$db][find] populated. ${baseDebugMessage}`);
                for (let i = 0; i < res.items.length; i++) {
                    res.items[i] = this._copyReadableItemProps(readableProps, res.items[i]);
                }
                console.debug(`[$db][find] complete. ${baseDebugMessage}`);
                return res;
            } catch (err) {
                console.debug(`[$db][find] populating error ${err}. ${baseDebugMessage}`);
                throw err;
            }
        } finally {
            clearTimeout(timeout);
        }
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
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        const p = options.user ? Promise.resolve(options.user) : this.getUser(options.userId || "system");
        p.then(async user => {
            const storeDesc = await configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                throw new Error("Store not found");
            }

            if (!(await auth.hasReadAccess(storeDesc.access, user))) {
                throw new Error("Unauthorized");
            }

            const filters = storeDesc.filters || {};
            for (let _queryName of Object.keys(query || {})) {
                const filter = filters[_queryName];
                if (!filter || !filter.query) {
                    continue;
                }

                let calculatedQuery;
                if (typeof filter.query === "function") {
                    try {
                        calculatedQuery = filter.query(query[_queryName]);
                    } catch (err) {
                        console.error("Error when calculating", err);
                    }
                } else {
                    calculatedQuery = this.mongo._compileQuery(filter.query, query[_queryName]);
                }

                query.$and = query.$and || [];
                query.$and.push(calculatedQuery);
                delete query[_queryName];
            }

            const accessQuery = await configStore.getMongoAccessQuery(storeDesc, user);
            if (accessQuery != null) {
                query.$and = (query.$and || []).concat([accessQuery]);
            }

            this.mongo.forEach(storeName, query, itemCb, cb);
        }).catch(e => {
            options.debug && console.log("Delete error:", e);
            cb(e);
        });

        return d;
    }

    get(storeName, _id, options = {}, cb) {
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;
        if (typeof options === "function") {
            cb = options;
            options = {};
        }

        if (_id == null) {
            cb(new Error("_id is null"));
            return d;
        }

        const query = typeof _id === "string" ? { _id } : _id;
        options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 0`);
        const userOption = options.user || options.userId || "system";
        this.getUser(userOption, async (err, user) => {
            if (err) {
                return cb(err);
            }

            options.debug &&
                console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 1: found user`);
            const config = await configStore.getConfig(options.user);
            const storeDesc = config[storeName];
            if (!storeDesc) {
                return cb(options.returnNull ? null : new Error("Store not found"), null);
            }

            if (!options.noCheckPermissions && !(await auth.hasReadAccess(storeDesc.access, user))) {
                return cb(new Error("Unauthorized"), null);
            }

            const readableProps = await configStore.getReadablePropsForUser(storeDesc, user);
            if (!Object.keys(readableProps).length === 0) {
                return cb(new Error("Unauthorized"), null);
            }

            options.debug &&
                console.log(
                    `Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 1: will find document in db`
                );
            let item;
            let p;
            const { dataSource } = storeDesc;
            if (dataSource) {
                p = configStore.getDataSource(storeDesc, this).get(query);
            } else {
                if (Object.keys(query).length === 2 && query._id && query.__v) {
                    p = this._getArchivedItem(storeDesc, query);
                } else {
                    p = this.mongo.get(storeName, _id, options);
                }
            }

            return p
                .catch(err => {
                    if (err.message === "Not found" && options.deleted) {
                        options.debug &&
                            console.log(
                                `Get item: ${JSON.stringify(
                                    _id
                                )} from store: "${storeName}". Stage 2.1: item not found. Will look in the "${storeName}_deleted" store.`
                            );
                        return this.mongo.get(`${storeName}_deleted`, _id);
                    }

                    throw err;
                })
                .then(res => {
                    item = res;
                    options.debug &&
                        console.log(
                            `Get item: ${JSON.stringify(
                                _id
                            )} from store: "${storeName}". Stage 2: result from db received.`
                        );

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
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

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

    async loadVirtualProps(storeName, item, storeDesc) {
        storeDesc = storeDesc || (await configStore.getStoreDesc(storeName));

        const load = async (_item, baseItem, props) => {
            for (const propName of Object.keys(props)) {
                const propDesc = props[propName];
                switch (propDesc.type) {
                    case "virtual":
                        _item[propName] = await propDesc.load(_item, baseItem);
                        break;
                    case "object":
                        if (_item[propName]) {
                            await load(_item[propName], _item, propDesc.props);
                        }
                        break;
                    case "objectList": {
                        let propValue = _item[propName];
                        if (propValue) {
                            for (let i = 0; i < (propValue || []).length; i++) {
                                const subItem = propValue[i];
                                await load(subItem, _item, propDesc.props);
                            }
                        }
                    }
                }
            }
        };

        if (Array.isArray(item)) {
            for (const _item of item) {
                await load(_item, null, storeDesc.props);
            }

            return;
        }

        return load(item, null, storeDesc.props);
    }

    async newId(storeName, storeDesc, item) {
        if (!storeName) {
            return uuid.v4();
        }

        const fn = async () => {
            storeDesc = storeDesc || (await configStore.getStoreDesc(storeName));
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
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        this.mongo.rawFindOneAndUpdate(
            "_sequences",
            { _id: sequenceId },
            { $inc: { sequence: 1 } },
            true,
            (err, res) => {
                if (err) {
                    return cb(err, null);
                }
                cb(null, res.sequence);
            }
        );

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
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

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

    async notify(storeName, receivers, message, cb) {
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

        const now = new Date();
        const expireAt = message.ttl ? new Date(now.setSeconds(now.getSeconds() + message.ttl)) : undefined;
        for (const receiver of receivers) {
            const m = {
                _id: await this.newId(),
                _ownerId: receiver,
                event: message.event,
                level: message.level,
                message: message.message,
                details: message.details,
                relatedObjects: message.relatedObjects,
                expireAt,
            };

            await this.set(storeName, m);
        }
    }

    async populateAll(storeName, item, user, cb) {
        var store;
        if (typeof storeName === "string") {
            const config = await configStore.getConfig(user);
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

        const d =
            typeof cbk !== "function"
                ? new Promise((f, r) => (cbk = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;
        if (!item._id) {
            console.debug("[$db][set] ERROR: no _id provided");
            cbk(new Error("No _id provided"), null);
            return d;
        }

        let user,
            storeDesc,
            unlock,
            newItem = null,
            prevItem = null,
            insert = false;
        this.getUser(options.user || options.userId || "system")
            .then(async _user => {
                console.debug("[$db][set] user loaded:", _user);
                user = _user;
                storeDesc = await configStore.getStoreDesc(storeName, user);
                if (!storeDesc) {
                    console.debug(`[$db][set] ERROR: store not found ${storeName}`);
                    throw new Error("Store not found");
                }
                if (storeDesc.type === "single" && item._id !== storeName) {
                    console.debug(`[$db][set] ERROR: invalid _id ${item._id} for single store ${storeName}`);
                    throw new Error("Invalid _id for single store");
                }
                if (!options.noCheckPermissions && !(await auth.hasUpdateAccess(storeDesc.access, user))) {
                    console.debug(`[$db][set] ERROR: unauthorized user ${user._id} for store ${storeName}`);
                    throw new Error("Unauthorized");
                }
                return sync.lock(item._id);
            })
            .then(_unlock => {
                console.debug(`[$db][set] mutex locked ${item._id}`);
                unlock = _unlock;
                return this.mongo.get(storeName, item._id).catch(() => null); // because it can be no saved item
            })
            .then(async _prevItem => {
                console.debug("[$db][set] prev item loaded:", _prevItem);
                prevItem = _prevItem;
                insert = !prevItem;
                newItem = JSON.parse(JSON.stringify(prevItem || {}));
                let err = this.mongo._mergeItems(newItem, item);
                if (err) {
                    console.debug(`[$db][set] ERROR: on merging for store ${storeName}`, err);
                    throw err;
                }
                await this._prepareItem(storeDesc.props, newItem, insert, user);
                if (options.noRunHooks) {
                    console.debug(`[$db][set] no need to run hooks for ${newItem._id} for store ${storeName}`);
                    return Promise.resolve();
                }
                return this._runHook(
                    storeName,
                    insert ? "willCreate" : "willSave",
                    user,
                    newItem,
                    prevItem && JSON.parse(JSON.stringify(prevItem))
                );
            })
            .then(async () => {
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

                const storeDesc = await configStore.getStoreDesc(storeName, user);
                if (!options.noValidate) {
                    const validationResult = validation.validate(storeDesc, newItem, null, user);
                    if (Object.keys(validationResult || {}).length > 0) {
                        console.error(
                            `[$db][set] VALIDATION ERROR for ${newItem._id} for store ${storeName}`,
                            storeName,
                            "/",
                            newItem._id,
                            JSON.stringify(validationResult, null, "  ")
                        );
                        throw new Error(`${storeName}.${newItem._id} validation failed`);
                    }
                }

                if (insert) {
                    newItem.__v = 1;
                    return this.mongo.insert(storeName, newItem);
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
                return this.mongo.rawFindOneAndUpdate(storeName, findQuery, updateQuery, options.upsert !== false);
            })
            .then(async savedItem => {
                console.debug("[$db][set] item saved in DB! Result:", savedItem);
                unlock();
                unlock = null;
                this._updateRefs(storeName, savedItem, prevItem);

                // setImmediate(() => {
                if (!insert && storeDesc.logging) {
                    await this._logItem(storeDesc, savedItem, prevItem, user);
                }
                // });
                return this._populateAndLoadVirtual(storeName, savedItem, storeDesc, user, options);
            })
            .then(async fullItem => {
                console.debug(`[$db][set] populated item ${fullItem._id} for store ${storeName}`);
                if (!options.noEmitUpdate) {
                    this.emit(
                        "update",
                        storeName,
                        JSON.parse(JSON.stringify(fullItem)),
                        prevItem && JSON.parse(JSON.stringify(prevItem))
                    );
                }
                const readableProps = await configStore.getReadablePropsForUser(storeDesc, user);
                const res = this._copyReadableItemProps(readableProps, fullItem);
                cbk(null, res);

                if (options.noRunHooks) {
                    return;
                }
                this._runHook(
                    storeName,
                    insert ? "didCreate" : "didSave",
                    user,
                    cloneDeep(fullItem),
                    prevItem && cloneDeep(prevItem)
                );
            })
            .then(() => {
                console.debug(`[$db][set] completed item for store ${storeName}`);
            })
            .catch(e => {
                console.debug("$db.set error:", e);
                if (typeof unlock === "function") {
                    unlock();
                }
                cbk(e, null);
            });

        return d;
    }

    setDangerously(storeName, item, cb = () => {}) {
        const options = { noValidate: true };
        return this.set(storeName, item, options, cb);
    }

    getUser(userId, cbk) {
        const d =
            typeof cbk !== "function"
                ? new Promise((f, r) => (cbk = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;
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
                this.mongo.get("users", userId, (err, user) => {
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
        for (const prop in readableProps) {
            if (source[prop] == null) {
                continue;
            }

            if (readableProps[prop] === true) {
                res[prop] = source[prop];
                continue;
            }

            if (typeof readableProps[prop] === "object") {
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

    async _getArchivedItem(storeDesc, query) {
        const archiveQuery = {
            query: {
                itemId: query._id,
                prevVer: { $gte: query.__v },
            },
            orderBy: "-prevVer",
            take: 10000,
            props: ["reverseDiff"],
        };

        const storeName = storeDesc.name;
        const item = await this.mongo.get(storeName, query._id);
        if (item.__v === query.__v) {
            return item;
        }

        // checking if version exists.
        await this.mongo.get(`${storeName}_log`, { itemId: query._id, prevVer: query.__v }, { props: ["_id"] });
        const olds = await this.mongo.rawFindAll(`${storeName}_log`, archiveQuery);
        for (const diff of olds) {
            jsonpatch.applyPatch(item, diff.reverseDiff);
        }

        return item;
    }

    // WIP
    _stringToDate(storeDesc, item) {
        const { props } = storeDesc;
        for (let propName of Object.keys(props)) {
            const propDesc = props[propName];
            if (!item[propName]) {
                continue;
            }

            switch (propDesc.type) {
                case "date":
                    item[propName] = new Date(item[propName]);
                    break;
                case "object":
                case "objectList":
                case "any":
            }
        }
    }

    _dateToString(item) {
        if (item == null || typeof item !== "object") {
            return item;
        }

        const res = {};

        for (let propName of Object.keys(item)) {
            const value = item[propName];
            if (value instanceof Date) {
                res[propName] = value.toISOString();
                continue;
            }

            if (Array.isArray(value)) {
                res[propName] = [];
                for (let i = 0; i < value.length; i++) {
                    res[propName][i] = this._dateToString(value[i]);
                }

                continue;
            }

            if (typeof value !== "object") {
                res[propName] = this._dateToString(value);
            }
        }

        return res;
    }

    async _logItem(storeDesc, item, prevItem) {
        const convertedItem = this._dateToString(item);
        const convertedPrevItem = this._dateToString(prevItem);
        const diff = jsonpatch.compare(convertedPrevItem, convertedItem);
        const reverseDiff = jsonpatch.compare(convertedItem, convertedPrevItem);

        const logRecord = {
            diff,
            reverseDiff,
            _id: await this.newId(),
            itemId: item._id,
            ver: item.__v,
            prevVer: prevItem.__v,
            createdAt: item.updatedAt,
            createdBy: item.updatedBy,
        };

        return this.mongo.insert(`${storeDesc.name}_log`, logRecord);
    }

    async _prepareItem(props, item, fillDefault, user) {
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
                    if (propDesc.noAutoTrim) {
                        item[p] = item[p] + "";
                    } else {
                        item[p] = (item[p] + "").trim();
                    }
                    break;
                case "object":
                    await this._prepareItem(propDesc.props, item[p], fillDefault, user);
                    break;
                case "objectList":
                    for (let i = 0; i < (item[p] || []).length; i++) {
                        await this._prepareItem(propDesc.props, item[p][i], fillDefault, user);
                    }
                    break;
                case "date":
                    try {
                        item[p] = new Date(item[p]);
                    } catch (err) {
                        throw new Error(`$item.${p} is not a date: ${item[p]}`);
                    }
                    break;
                case "password":
                    if (typeof item[p] === "string" && item[p].length > 0) {
                        const pass = {};
                        pass.salt = await this.newId();
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
            prevValue = prevItem && prevItem[ref.prop] ? [prevItem[ref.prop]] : [];
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
                return console.error(
                    `[__updateLinkRef] Can't find pair in store ${storeName}, refItemId: ${refItemId}`,
                    err
                );
            }

            if (res == null || res._deleted) {
                return;
            }

            const data = remove ? this.__removeLinkFromRef(ref, res, linkId) : this.__addLinkToRef(ref, res, linkId);
            if (data) {
                this.set(storeName, data, { noRunHooks: true }, err => {
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
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;
        const itemsProcessors = [];
        const itemsCache = {};

        let itemProcessor = item => {
            let p = () => {
                return new Promise(resolve => {
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
                                return new Promise(resolve => {
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
                                                console.error(
                                                    `When populating in store ${store.name} itemId: ${
                                                        item._id
                                                    }. refStore: "${prop.store}", refId: "${refKey}"`,
                                                    err
                                                );
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
                                        this.mongo.get(prop.store, refKey, (err, data) => {
                                            if (err) {
                                                console.error(
                                                    `When populating in store ${store.name} itemId: ${
                                                        item._id
                                                    }. refStore: "${prop.store}", refId: "${refKey}"`,
                                                    err
                                                );
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

                    Promise.series(all).then(() => {
                        resolve(item);
                    });
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

    async _populateAndLoadVirtual(storeName, item, storeDesc, user, options) {
        if (!options.noPopulate) {
            try {
                await this.populateAll(storeDesc, item, user);
                if (!options.noLoadVirtualProps) {
                    await this.loadVirtualProps(storeName, item, storeDesc);
                }

                return item;
            } catch (err) {
                console.error("[$db][_populateAndLoadVirtual] error", err);
                throw err;
            }
        }

        if (!options.noLoadVirtualProps) {
            try {
                await this.loadVirtualProps(storeName, item, storeDesc);
            } catch (err) {
                console.error("[$db][_populateAndLoadVirtual] error", err);
                throw err;
            }
        }

        return item;
    }
}

function emptyHook() {}

let $db = new DB();
module.exports = $db;
