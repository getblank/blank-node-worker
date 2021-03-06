"use strict";
// TODO: rewrite this module with async/await

// options is the object with such struct:
// {
//      user: Object – user to check permissions and pass to the itemLifeCycle hooks
//      userId: string – if user prop was not provided, it will be taken from db by userId
//      noCheckPermissions: bool – if true, will not check permissions to make db request
//      noMerge: bool — if true, will not merge with existing document and update only provided fields
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
//      tx: PostgreSQL transaction
// }

const mongodb = require("./mongoDB");
const postgres = require("./postgresDB");
const filter = require("./filter");
const configStore = require("../configStore");
const sync = require("../sync");
const uuid = require("uuid");
const EventEmitter = require("events");
const auth = require("../auth");
const validation = require("validation").default;
const cloneDeep = require("lodash.clonedeep");
const jsonpatch = require("fast-json-patch");
const constants = require("constants.js");

const notFoundMessage = "Not found";

class DB extends EventEmitter {
    constructor() {
        super();
        this.del = this.delete.bind(this);
        this.setupMongo = mongodb.setup;
        this.mongo = mongodb;
    }

    isNotFound(err) {
        if (err.message.toLowerCase() === notFoundMessage.toLowerCase()) {
            return true;
        }

        return false;
    }

    postgres() {
        return postgres;
    }

    // Pass true as first argument to start mongodb transaction.
    // Otherwise it starts postgres transaction.
    begin(options, cb) {
        if (options === true) {
            const $db = new DB();
            $db.mongo = this.mongo.begin();
            $db._tx = true;

            return $db;
        }

        if (typeof options === "function") {
            cb = options;
            options = undefined;
        }

        return postgres.begin(options, cb);
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

    async waitForConnection(storeName) {
        if (!storeName) {
            return mongodb.waitForConnection;
        }

        const storeDesc = await configStore.getStoreDesc(storeName);
        if (!storeDesc) {
            throw new Error(`store ${storeName} not found`);
        }

        const { dataSource } = storeDesc;
        switch (dataSource.type) {
            case "file":
                return;
            case "postgres":
                return postgres.waitForConnection;
            case "mongo":
                return mongodb.waitForConnection;
        }
    }

    async count(storeName, query, options) {
        const request = { query, count: 0 };
        const res = await this.find(storeName, request, options);

        return res.count;
    }

    async _delete(storeDesc, item, user, options) {
        const { dataSource } = storeDesc;
        switch (dataSource.type) {
            case "mongo":
                return new Promise((resolve, reject) => {
                    if (options.drop) {
                        this.mongo._delete(storeDesc.name, item._id, err => {
                            if (err) {
                                return reject(err);
                            }

                            resolve();
                        });

                        return;
                    }

                    this.mongo._set(`${storeDesc.name}_deleted`, item._id, item, err => {
                        if (err) {
                            return reject(err);
                        }

                        this.mongo._delete(storeDesc.name, item._id, err => {
                            if (err) {
                                return reject(err);
                            }

                            resolve();
                        });
                    });
                });
            case "postgres": {
                const { _id } = item;
                await postgres.table(storeDesc.name).then(res => res.delete({ _id }, user, options));
                if (options.drop) {
                    return;
                }

                return postgres.table(storeDesc.name + "_deleted").then(res => res.insert(item, options));
            }
            case "file":
                return configStore.getDataSource(storeDesc, this).delete(item, user, options);
        }

        throw new Error(`invalid dataSource.type: ${dataSource.type}`);
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

        var user, item, storeDesc;
        let p = options.user ? Promise.resolve(options.user) : this.getUser(options.userId || "system");
        p.then(async _user => {
            user = _user;
            storeDesc = await configStore.getStoreDesc(storeName, user);
            if (!storeDesc) {
                throw new Error("Store not found");
            }

            if (!(await auth.hasDeleteAccess(storeDesc.access, user))) {
                throw new Error("Unauthorized");
            }

            if (storeDesc.type === "notification" && options.drop == null) {
                options.drop = true;
            }

            return this._get(storeDesc, _id, user, options);
        })
            .then(_item => {
                if (!_item || _item._deleted === true) {
                    throw new Error(notFoundMessage);
                }

                item = _item;
                options.debug && console.log("Item to delete:", item);
                item._deleted = true;
                return this._runHook(storeName, "willRemove", user, item, options);
            })
            .then(() => {
                return this._delete(storeDesc, item, user, options);
            })
            .then(() => {
                cbk();
                this.emit("delete", storeDesc.name, item, options.tx);
                options.debug && console.log("Before didRemove hook:", item);
                this._runHook(storeDesc.name, "didRemove", user, item, options);
            })
            .catch(err => {
                options.debug && console.log("Delete error:", err);
                cbk(err);
            });

        return d;
    }

    async _simpleFind(storeDesc, request, user, options = {}) {
        if (typeof storeDesc === "string") {
            storeDesc = await configStore.getStoreDesc(storeDesc);
        }

        const { dataSource } = storeDesc;
        const storeName = options.archive ? `${storeDesc.name}_log` : storeDesc.name;
        switch (dataSource.type) {
            case "file":
                return configStore.getDataSource(storeDesc, this).find(request, user, options);
            case "postgres":
                request.query = options.archive ? request.query : await filter.prepare(storeDesc, request.query, user);

                return postgres.table(storeName).then(res => res.find(request, user, options));
            case "mongo":
                request.query = options.archive ? request.query : await filter.prepare(storeDesc, request.query, user);

                return this.mongo.find(storeName, request);
        }

        throw new Error(`invalid dataSource.type: ${dataSource.type}`);
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
            try {
                res = await this._simpleFind(storeDesc, request, user, options);
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

    async _simpleGet(storeDesc, query, user = {}, options = {}) {
        if (typeof storeDesc === "string") {
            storeDesc = await configStore.getStoreDesc(storeDesc);
        }

        const { dataSource } = storeDesc;
        const storeName = options.archive ? `${storeDesc.name}_log` : storeDesc.name;
        switch (dataSource.type) {
            case "mongo": {
                if (typeof query === "string") {
                    return this.mongo.get(storeName, query, options);
                }

                const q = options.archive ? query : await filter.prepare(storeDesc, query, user);

                return this.mongo.get(storeName, q, options);
            }
            case "postgres": {
                const q = options.archive ? query : await filter.prepare(storeDesc, query, user);

                return postgres.table(storeName).then(res => res.get(q, user, options));
            }
            case "file":
                return configStore.getDataSource(storeDesc, this).get(query, user, options);
        }

        throw new Error(`invalid dataSource.type: ${dataSource.type}`);
    }

    async _get(storeDesc, query, user, options) {
        let storeName = storeDesc.name;
        if (typeof storeDesc === "string") {
            storeName = storeDesc;
            const delMatch = storeName.match(/(.*)_deleted$/);
            if (delMatch) {
                storeDesc = await configStore.getStoreDesc(delMatch[1]);
            } else {
                storeDesc = await configStore.getStoreDesc(storeName);
            }
        }

        if (Object.keys(query).length === 2 && query._id && query.__v) {
            return this._getArchivedItem(storeDesc, query);
        }

        return this._simpleGet(storeDesc, query, user, options);
    }

    async get(storeName, _id, options = {}) {
        if (_id == null) {
            throw new Error("_id is null");
        }

        const query = typeof _id === "string" ? { _id } : _id;
        options.debug && console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 0`);
        const userOption = options.user || options.userId || "system";

        const user = await this.getUser(userOption);

        options.debug &&
            console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 1: found user`);
        const storeDesc = await configStore.getStoreDesc(storeName, user);
        if (!storeDesc) {
            throw new Error("Store not found");
        }

        if (!options.noCheckPermissions && !(await auth.hasReadAccess(storeDesc.access, user))) {
            throw new Error("Unauthorized");
        }

        const readableProps = await configStore.getReadablePropsForUser(storeDesc, user);
        if (!Object.keys(readableProps).length === 0) {
            throw new Error("Unauthorized");
        }

        options.debug &&
            console.log(
                `Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 1: will find document in db`
            );

        let item;

        return this._get(storeDesc, query, user, options)
            .catch(err => {
                if (err.message === notFoundMessage && options.deleted) {
                    options.debug &&
                        console.log(
                            `Get item: ${JSON.stringify(
                                _id
                            )} from store: "${storeName}". Stage 2.1: item not found. Will look in the "${storeName}_deleted" store.`
                        );
                    return this._get(`${storeName}_deleted`, _id);
                }

                throw err;
            })
            .then(res => {
                item = res;
                options.debug &&
                    console.log(
                        `Get item: ${JSON.stringify(_id)} from store: "${storeName}". Stage 2: result from db received.`
                    );

                return this._populateAndLoadVirtual(storeName, item, storeDesc, user, options);
            })
            .then(res => {
                res = this._copyReadableItemProps(readableProps, item);
                return res;
            })
            .catch(err => {
                options.debug &&
                    console.log(`Get item: ${JSON.stringify(_id)} from store: "${storeName}". Errored.`, err);
                if (err.message === notFoundMessage && options.returnNull) {
                    return null;
                }

                throw err;
            });
    }

    async insert(storeName, item, options = {}) {
        const id = await this.newId(storeName, null, item);
        const e = await this.get(storeName, id, { returnNull: true }, { props: ["_id"] });
        if (e != null) {
            throw new Error(`item id "${id}" exists`);
        }

        item._id = id;
        const noEmitUpdate = options.noEmitUpdate;
        const opts = { ...options };
        opts.noEmitUpdate = true;

        const $item = await this.set(storeName, item, opts);
        if (!noEmitUpdate) {
            const createdItem = cloneDeep($item);
            this.emit("create", storeName, createdItem, options.tx);
        }

        return $item;

        // this.newId(storeName, null, item)
        //     .then(res => {
        //         item._id = res;
        //         const noEmitUpdate = options.noEmitUpdate;
        //         options.noEmitUpdate = true;

        //         this.set(storeName, item, options, (err, $item) => {
        //             if (err) {
        //                 return cb(err, null);
        //             }
        //             if (!noEmitUpdate) {
        //                 const createdItem = cloneDeep($item);
        //                 this.emit("create", storeName, createdItem, options.tx);
        //             }

        //             cb(null, $item);
        //         });
        //     })
        //     .catch(err => cb(err));

        // return d;
    }

    async loadVirtualProps(storeName, item, storeDesc, user) {
        storeDesc = storeDesc || (await configStore.getStoreDesc(storeName));

        const load = async (_item, baseItem, props) => {
            for (const propName of Object.keys(props)) {
                const propDesc = props[propName];
                switch (propDesc.type) {
                    case "virtual":
                        _item[propName] = await propDesc.load(_item, baseItem, user);
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

    // TODO: test it.
    async logError(storeName, action, context, userId, err) {
        if (typeof context !== "string") {
            context = JSON.stringify(context);
        }

        const error = (err || "").replace(
            /(\\n\s+)/g,
            `
`
        );
        const item = {
            action,
            context,
            userId,
            error,
            name: `${storeName}/${action}`,
            store: storeName,
        };

        const errorLogsStoreName = "errorLogs";
        const storeDesc = await configStore.getStoreDesc(errorLogsStoreName);
        const { dataSource } = storeDesc;
        switch (dataSource.type) {
            case "mongo": {
                item._id = await this.newId(errorLogsStoreName);
                return this.mongo.insert(errorLogsStoreName, item);
            }
            case "postgres":
                return postgres.table(errorLogsStoreName).then(res => res.insert(item));
            case "file":
                return configStore.getDataSource(storeDesc, this).insert(item);
        }
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

    async nextSequence(sequenceId, options) {
        let table;
        try {
            table = await postgres.table("_sequences");
        } catch (err) {
            const res = await this.mongo.rawFindOneAndUpdate(
                "_sequences",
                { _id: sequenceId },
                { $inc: { sequence: 1 } },
                true
            );

            return res.sequence;
        }

        return table.nextSequence(sequenceId, options);
    }

    async nextSequenceString(sequenceId, stringLength, options) {
        if (!stringLength) {
            stringLength = 6;
        }

        let res = await this.nextSequence(sequenceId, options);
        const zeros = "0000000000000000";
        res += "";
        if (res.length >= stringLength) {
            return res;
        }

        res = zeros.slice(0, stringLength - res.length) + res;

        return res;
    }

    async notify(storeName, receivers, message, options) {
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

            await this.set(storeName, m, options);
        }
    }

    async populateAll(storeName, item, user) {
        let storeDesc;
        if (typeof storeName === "string") {
            const config = await configStore.getConfig(user);
            storeDesc = config[storeName];
            if (!storeDesc) {
                throw new Error("Store not found");
            }
        } else {
            storeDesc = storeName;
        }

        return this._populateAll(storeDesc, item, user);
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

        let user;
        let storeDesc;
        let unlock;
        let newItem = null;
        let prevItem = null;
        let insert = false;
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
                return this._get(storeDesc, item._id, user, options).catch(err => null); // because it can be no saved item
            })
            .then(async _prevItem => {
                console.debug("[$db][set] prev item loaded:", _prevItem);
                prevItem = _prevItem;
                insert = !prevItem;
                newItem = options.noMerge ? cloneDeep(item) : cloneDeep(prevItem || {});
                if (!options.noMerge) {
                    const err = this.mongo._mergeItems(newItem, item);
                    if (err) {
                        console.debug(`[$db][set] ERROR: on merging for store ${storeName}`, err);
                        throw err;
                    }
                } else {
                    const { createdAt, createdBy, _ownerId } = prevItem || {};
                    newItem.createdAt = newItem.createdAt || createdAt;
                    newItem.createdBy = newItem.createdBy || createdBy;
                    newItem._ownerId = newItem._ownerId || _ownerId;
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
                    prevItem && cloneDeep(prevItem),
                    options
                );
            })
            .then(async () => {
                console.debug(`[$db][set] hooks completed for ${newItem._id} for store ${storeName}, ready to save`);
                let version = newItem.__v || null;
                delete newItem.__v;
                if (insert) {
                    newItem.createdAt = newItem.createdAt || new Date();
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
                    switch (storeDesc.dataSource.type) {
                        case "mongo":
                            return this.mongo.insert(storeName, newItem);
                        case "postgres":
                            return postgres.table(storeName).then(res => res.insert(newItem, user, options));
                        case "file":
                            return configStore.getDataSource(storeDesc, this).insert(newItem, user, options);
                    }
                }

                delete newItem._id;
                let findQuery = { _id: item._id };
                if (version) {
                    findQuery.__v = version;
                }

                const updateQuery = {
                    $set: newItem,
                    $inc: { __v: 1 },
                };
                switch (storeDesc.dataSource.type) {
                    case "mongo":
                        return this.mongo.rawFindOneAndUpdate(
                            storeName,
                            findQuery,
                            updateQuery,
                            options.upsert !== false,
                            options.noMerge === true
                        );
                    case "postgres":
                        return postgres.table(storeName).then(res => res.set(findQuery, newItem, user, options));
                    case "file":
                        return configStore.getDataSource(storeDesc, this).set(findQuery, newItem, user, options);
                }
            })
            .then(async savedItem => {
                console.debug("[$db][set] item saved in DB! Result:", savedItem);
                unlock();
                unlock = null;
                this._updateRefs(storeName, savedItem, prevItem);

                // setImmediate(() => {
                if (!insert && storeDesc.logging) {
                    await this._logItem(storeDesc, savedItem, prevItem, user, options);
                }
                // });
                return this._populateAndLoadVirtual(storeName, savedItem, storeDesc, user, options);
            })
            .then(async fullItem => {
                console.debug(`[$db][set] populated item ${fullItem._id} for store ${storeName}`);
                if (!options.noEmitUpdate) {
                    this.emit("update", storeName, cloneDeep(fullItem), prevItem && cloneDeep(prevItem), options.tx);
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
                    prevItem && cloneDeep(prevItem),
                    options
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

    async validate(storeName, item, user) {
        const storeDesc = await configStore.getStoreDesc(storeName, user);
        const validationResult = validation.validate(storeDesc, item, null, user);

        return this.validateProps(validationResult, storeDesc.props);
    }

    validateProps(validationResult, props) {
        const { validityErrors } = constants;
        for (const propName of Object.keys(validationResult || {})) {
            const errors = validationResult[propName];
            for (let i = 0; i < errors.length; i++) {
                const res = errors[i];
                res.label = props[propName].label;
                res.formGroup = props[propName].formGroup;
                switch (res.type) {
                    case validityErrors.INNER_ERROR:
                        validationResult[propName] = this.validateProps(
                            validationResult[propName],
                            props[propName].props
                        );
                        break;
                    case validityErrors.TYPE_ERROR:
                        res.description = "Не совпадение типа";
                        break;
                    case validityErrors.REQUIRED:
                        res.description = "Обязательное поле";
                        break;
                    case validityErrors.MIN:
                        res.description = "Значение меньше допустимого";
                        break;
                    case validityErrors.MAX:
                        res.description = "Значение больше допустимого";
                        break;
                    case validityErrors.MIN_LENGTH:
                        res.description = "Длина меньше допустимой";
                        break;
                    case validityErrors.MAX_LENGTH:
                        res.description = "Длина больше допустимой";
                        break;
                    case validityErrors.PATTERN:
                        res.description = "Не подходит под шаблон";
                        break;
                    case validityErrors.MASK:
                        res.description = "Не подходит под маску";
                        break;
                    case validityErrors.EXPRESSION:
                        res.description = "Прочая ошибка";
                }
            }
        }

        return validationResult;
    }

    async getUser(userId) {
        if (typeof userId === "object") {
            return userId;
        }

        switch (userId) {
            case "system":
                return {
                    _id: userId,
                    roles: ["system"],
                };
            case "root":
                return {
                    _id: userId,
                    roles: ["root"],
                };
            case "guest":
                return {
                    _id: userId,
                    roles: ["guest"],
                };
            default:
                try {
                    const storeDesc = await configStore.getStoreDesc("users");
                    return this._get(storeDesc, { _id: userId }, {});
                } catch (err) {
                    if (process.env.NODE_ENV === "test") {
                        if (userId === "UNKNOWN") {
                            return null;
                        }

                        return {
                            _id: userId,
                            roles: ["root"],
                        };
                    }

                    throw err;
                }
        }
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
        const item = await this._simpleGet(storeName, query._id);
        if (item.__v === query.__v) {
            return item;
        }

        // checking if version exists.
        await this._simpleGet(storeName, { itemId: query._id, prevVer: query.__v }, null, {
            archive: true,
            props: ["_id"],
        });
        const { items: olds } = await this._simpleFind(storeName, archiveQuery, null, { archive: true });
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

    _prepareToLog(item, props = {}) {
        if (item == null || typeof item !== "object") {
            if (item instanceof Date) {
                return item.toISOString();
            }

            return item;
        }

        const res = {};

        for (const propName of Object.keys(item)) {
            const propDesc = props[propName] || {};
            if (propDesc.type === "virtual") {
                continue;
            }

            const value = item[propName];
            if (value instanceof Date) {
                res[propName] = value.toISOString();
                continue;
            }

            if (Array.isArray(value)) {
                res[propName] = [];
                for (let i = 0; i < value.length; i++) {
                    res[propName][i] = this._prepareToLog(value[i], propDesc.props);
                }

                continue;
            }

            res[propName] = this._prepareToLog(value, propDesc.props);
        }

        return res;
    }

    async _logItem(storeDesc, item, prevItem, options = {}) {
        const convertedItem = this._prepareToLog(item, storeDesc.props);
        const convertedPrevItem = this._prepareToLog(prevItem, storeDesc.props);
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
            actionSource: (options.$context || {}).actionSource,
        };

        switch (storeDesc.dataSource.type) {
            case "mongo":
                return this.mongo.insert(`${storeDesc.name}_log`, logRecord, options);
            case "postgres":
                return postgres.table(`${storeDesc.name}_log`).then(res => res.insert(logRecord, null, options));
            case "file":
                return configStore.getDataSource(`${storeDesc.name}_log`, this).insert(logRecord, null, options);
        }

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

            if (propDesc.populated) {
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
                case "date": {
                    const val = new Date(item[p]);
                    if (isNaN(val.getTime())) {
                        throw new Error(`$item.${p} is not a date: ${item[p]}`);
                    }

                    item[p] = val;
                    break;
                }
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
            for (const p of Object.keys(props)) {
                if (item[p] != null) {
                    continue;
                }

                if (typeof props[p].$default === "function") {
                    item[p] = props[p].$default(item, user, require("../i18n"));
                } else if (props[p].default != null) {
                    item[p] = props[p].default;
                }
            }
        }
    }

    _runHook(storeName, hookName, arg1, arg2, arg3, options) {
        const hookFn = configStore.getItemEventHandler(storeName, hookName) || emptyHook;
        return hookFn(arg1, arg2, arg3, options);
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

    _populateAll(storeDesc, _item, $user) {
        const itemsProcessors = [];
        const itemsCache = {};
        const storesCache = {};

        const itemProcessor = item => {
            const p = () => {
                return new Promise(resolve => {
                    if (!storeDesc.props) {
                        return resolve(item);
                    }

                    const all = [];
                    const keys = Object.keys(storeDesc.props);
                    if (keys.length === 0) {
                        return resolve(item);
                    }

                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        const propDesc = storeDesc.props[key];
                        const refList = propDesc.type === "refList";
                        if (!propDesc.populateIn) {
                            continue;
                        }

                        if (!item[key]) {
                            item[propDesc.populateIn.prop] = null;
                            continue;
                        }

                        const refKeys = refList ? item[key] : [item[key]];
                        for (const itemRefKey of refKeys) {
                            const refId = itemRefKey._id || itemRefKey;
                            const refStore = itemRefKey.store || propDesc.store;
                            const refKey = refId;
                            itemsCache[refStore] = itemsCache[refStore] || {};

                            const p = () => {
                                return new Promise(async resolve => {
                                    if (itemsCache[refStore][refKey]) {
                                        if (refList) {
                                            item[propDesc.populateIn.prop] = item[propDesc.populateIn.prop] || [];
                                            item[propDesc.populateIn.prop].push(itemsCache[refStore][refKey]);
                                        } else {
                                            item[propDesc.populateIn.prop] = itemsCache[refStore][refKey];
                                        }

                                        return resolve();
                                    }

                                    if (refStore === "users") {
                                        try {
                                            let data = await this.getUser(refKey);
                                            data = propDesc.populateIn.fn ? propDesc.populateIn.fn(data) : data;
                                            if (refList) {
                                                item[propDesc.populateIn.prop] = item[propDesc.populateIn.prop] || [];
                                                item[propDesc.populateIn.prop].push(data);
                                            } else {
                                                item[propDesc.populateIn.prop] = data;
                                            }

                                            itemsCache[refStore][refKey] = data;
                                            return resolve();
                                        } catch (err) {
                                            console.error(
                                                `When populating in store ${storeDesc.name} itemId: ${item._id}. refStore: "${refStore}", refId: "${refKey}"`,
                                                err
                                            );
                                            return resolve();
                                        }
                                    }

                                    if (!storesCache[refStore]) {
                                        storesCache[refStore] = await configStore.getStoreDesc(refStore, $user);
                                    }

                                    const refStoreDesc = storesCache[refStore];
                                    this._get(refStoreDesc, refKey, $user)
                                        .then(data => {
                                            data = propDesc.populateIn.fn ? propDesc.populateIn.fn(data) : data;
                                            if (refList) {
                                                item[propDesc.populateIn.prop] = item[propDesc.populateIn.prop] || [];
                                                item[propDesc.populateIn.prop].push(data);
                                            } else {
                                                item[propDesc.populateIn.prop] = data;
                                            }

                                            itemsCache[refStore][refKey] = data;

                                            resolve();
                                        })
                                        .catch(err => {
                                            console.error(
                                                `When populating in store ${storeDesc.name} itemId: ${item._id}. refStore: "${refStore}", refId: "${refKey}"`,
                                                err
                                            );
                                            resolve();
                                        });
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

        return Promise.series(itemsProcessors).then(res => _item);
    }

    async _populateAndLoadVirtual(storeName, item, storeDesc, user, options) {
        if (!options.noPopulate) {
            try {
                await this.populateAll(storeDesc, item, user);
                if (!options.noLoadVirtualProps) {
                    await this.loadVirtualProps(storeName, item, storeDesc, user);
                }

                return item;
            } catch (err) {
                console.error("[$db][_populateAndLoadVirtual] error", err);
                throw err;
            }
        }

        if (!options.noLoadVirtualProps) {
            try {
                await this.loadVirtualProps(storeName, item, storeDesc, user);
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
