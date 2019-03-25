"use strict";

const { MongoClient } = require("mongodb");
const EventEmitter = require("events");
const configStore = require("../configStore");

const errNotConnectedMessage = "Not connected";
const errNotFoundMessage = "Not found";

const getCollectionName = storeName => {
    return configStore.getMongoCollectionName(storeName);
};

class DB extends EventEmitter {
    constructor() {
        super();
        this.db = null;
        this.mongoUri = null;
        this.connected = false;
        this.waitForConnection = new Promise((f, r) => {
            this.resolveConnection = f;
        });
        this._timeout = 250;

        for (const key of Object.getOwnPropertyNames(this.constructor.prototype)) {
            const value = this[key];

            if (key !== "constructor" && typeof value === "function") {
                this[key] = value.bind(this);
            }
        }
    }

    begin() {
        if (!this.connected) {
            throw new Error(errNotConnectedMessage);
        }

        const db = new DB();
        db.connected = this.connected;
        db.db = this.db;
        db.session = this.client.startSession();
        db.session.startTransaction();

        return db;
    }

    async commit() {
        if (!this.session) {
            throw new Error("Transaction does not started");
        }

        await this.session.commitTransaction();
        this.session.endSession();
        delete this.session;
        delete this.db;
        delete this.client;
    }

    async rollback() {
        if (!this.session) {
            throw new Error("Transaction does not started");
        }

        await this.session.abortTransaction();
        this.session.endSession();
        delete this.session;
        delete this.db;
        delete this.client;
    }

    createIndex(store, idx, cb) {
        if (!this.connected) {
            return cb(new Error(errNotConnectedMessage), null);
        }

        store = getCollectionName(store);
        this.db.collection(store, { strict: false }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            if (Array.isArray(idx)) {
                if (idx.length === 0) {
                    return cb(new Error("Invalid index"));
                }
                return collection.createIndex(idx[0], idx[1] || {}, cb);
            }
            collection.createIndex(idx, {}, cb);
        });
    }

    get(store, query, options, cb) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        } else if (options == null) {
            options = {};
        }

        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        store = getCollectionName(store);
        if (!this.connected) {
            cb(new Error(errNotConnectedMessage), null);
            return d;
        }

        if (typeof query === "string" || typeof query === "number") {
            query = { _id: query };
        }

        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                if (/collection.*does not exist/i.test(err.message)) {
                    return cb(new Error(errNotFoundMessage), null);
                }
                return cb(err, null);
            }

            const getOptions = {};
            if (options.props) {
                getOptions.fields = {};
                for (const prop of options.props) {
                    getOptions.fields[prop] = 1;
                }
            }

            this.rawFindOne(store, query, getOptions, cb);
        });
        return d;
    }

    find(store, query, cb) {
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        store = getCollectionName(store);
        if (!this.connected) {
            cb(new Error(errNotConnectedMessage), null);
            return d;
        }

        const result = {
            count: 0,
            items: [],
            currentIndex: null,
            currentItem: null,
            stateCounts: {},
        };
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(null, result);
            }

            collection.find(query.query || {}, { session: this.session || undefined }).count((err, res) => {
                result.count = res;
                if (res === 0 || query.take === 0 || query.skip >= res) {
                    return cb(null, result);
                }

                this.rawFindAll(store, query, (err, res) => {
                    if (err) {
                        return cb(err, null);
                    }

                    if (!res) {
                        return cb(null, result);
                    }

                    result.items = res;
                    cb(null, result);
                });
            });
        });

        return d;
    }

    forEach(store, query, itemCb = () => {}, cb = () => {}) {
        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error(errNotConnectedMessage), null);
        }

        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }

            collection.find(query, { session: this.session || undefined }, (err, cursor) => {
                const processItem = (err, item) => {
                    const res = itemCb(item);
                    if (res instanceof Promise) {
                        res.then(() => runNext());
                    } else {
                        runNext();
                    }
                };

                const runNext = () => {
                    cursor.hasNext((err, hasNext) => {
                        if (hasNext && err == null) {
                            return cursor.next(processItem);
                        }

                        cb(null, null);
                    });
                };

                runNext();
            });
        });
    }

    insert(storeName, item, cb) {
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        storeName = getCollectionName(storeName);

        if (!item._id) {
            cb(new Error("Now _id in item"), null);
            return d;
        }

        if (!this.connected) {
            cb(new Error(errNotConnectedMessage), null);
            return d;
        }

        this.db.collection(storeName, { strict: false }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }

            collection.insertOne(item, { session: this.session || undefined }, (err, res) => {
                if (err) {
                    return cb(err, null);
                }

                if (!res) {
                    return cb(new Error(errNotFoundMessage), null);
                }

                if (res.result.ok) {
                    return cb(null, item);
                }

                return cb(new Error("Insert failed"), null);
            });
        });

        return d;
    }

    rawFindOne(store, query, options, cb) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        } else if (options == null) {
            options = {};
        }

        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error(errNotConnectedMessage), null);
        }

        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }

            options = Object.assign({}, options, { session: this.session || undefined });
            collection.findOne(query, options, (err, result) => {
                if (err) {
                    return cb(err, null);
                }
                if (result == null) {
                    return cb(new Error(errNotFoundMessage), null);
                }
                cb(null, result);
            });
        });
    }

    rawFindOneAndUpdate(storeName, query, update, upsert, replace) {
        storeName = getCollectionName(storeName);
        if (!this.connected) {
            throw new Error(errNotConnectedMessage);
        }

        return new Promise((resolve, reject) => {
            this.db.collection(storeName, { strict: false }, (err, collection) => {
                if (replace) {
                    return collection.findOneAndReplace(
                        query,
                        update,
                        { returnOriginal: false, session: this.session || undefined, upsert },
                        (err, res) => {
                            if (err) {
                                return reject(err);
                            }
                            if (res.ok && res.value != null) {
                                return resolve(res.value);
                            }
                            return reject(
                                new Error(
                                    (res.lastErrorObject && (res.lastErrorObject.MongoError || res.lastErrorObject)) ||
                                        res
                                )
                            );
                        }
                    );
                }

                collection.findOneAndUpdate(
                    query,
                    update,
                    { returnOriginal: false, session: this.session || undefined, upsert },
                    (err, res) => {
                        if (err) {
                            return reject(err);
                        }
                        if (res.ok && res.value != null) {
                            return resolve(res.value);
                        }
                        return reject(
                            new Error(
                                (res.lastErrorObject && (res.lastErrorObject.MongoError || res.lastErrorObject)) || res
                            )
                        );
                    }
                );
            });
        });
    }

    rawFindAll(store, query, cb) {
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        store = getCollectionName(store);
        if (!this.connected) {
            cb(new Error(errNotConnectedMessage), null);

            return d;
        }

        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }

            const q = query.query || {};
            let cursor;

            if (query.props) {
                const projection = {};
                if (Array.isArray(query.props) && query.props.length > 0) {
                    for (let propName of query.props) {
                        projection[propName] = 1;
                    }
                } else {
                    Object.assign(projection, query.props);
                }

                cursor = collection.find(q, { projection, session: this.session || undefined });
            } else {
                cursor = collection.find(q, { session: this.session || undefined });
            }

            if (query.skip != null) {
                cursor = cursor.skip(query.skip);
            }

            if (query.take != null) {
                cursor = cursor.limit(query.take);
            }

            if (query.orderBy != null) {
                if (typeof query.orderBy === "string") {
                    const sortQuery = {};
                    const splittedOrderBy = query.orderBy.split(",").map(e => e.trim());
                    for (let orderBy of splittedOrderBy) {
                        let sortProp = orderBy;
                        let sortSign = 1;
                        if (sortProp[0] === "-") {
                            sortProp = sortProp.slice(1);
                            sortSign = -1;
                        }
                        sortQuery[sortProp] = sortSign;
                    }

                    cursor = cursor.sort(sortQuery);
                } else {
                    cursor = cursor.sort(query.orderBy);
                }
            }

            if (query.sort != null) {
                cursor = cursor.sort(query.sort);
            }

            let result = [];
            let stream = cursor.stream();

            stream.on("data", doc => {
                result.push(doc);
            });

            stream.on("error", error => {
                cb(error);
            });

            stream.on("end", () => {
                stream.close();
                cb(null, result);
            });
        });

        return d;
    }

    setup(mongoUri) {
        if (this.mongoUri !== mongoUri) {
            this.mongoUri = mongoUri;
            this.__connect();
        }
    }

    _insertMany(store, data, cb) {
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        store = getCollectionName(store);
        if (!this.connected) {
            cb(new Error(errNotConnectedMessage), null);
            return d;
        }
        this.db.collection(store, { strict: false }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            collection.insertMany(data, { strict: false, session: this.session || undefined }, cb);
        });

        return d;
    }

    _set(store, id, data, cb = () => {}) {
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        store = getCollectionName(store);
        if (!this.connected) {
            cb(new Error(errNotConnectedMessage), null);
            return d;
        }

        this.db.collection(store, { strict: false, session: this.session || undefined }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            collection.updateOne({ _id: id }, { $set: data }, { upsert: true }, (err, res) => {
                if (err) {
                    return cb(err, null);
                }
                cb(null, data);
            });
        });

        return d;
    }

    _delete(store, id, cb = () => {}) {
        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error(errNotConnectedMessage), null);
        }

        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err);
            }

            collection.deleteOne({ _id: id }, { session: this.session || undefined }, (err, result) => {
                if (err) {
                    return cb(err, null);
                }

                cb(null, result);
            });
        });
    }

    _dropCollection(store, cb) {
        const d =
            typeof cb !== "function"
                ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
                : null;

        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error(errNotConnectedMessage), null);
        }

        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb();
            }
            collection.drop(cb);
        });

        return d;
    }

    _compileQuery(query, value) {
        if (typeof query !== "object") {
            if (query === "$value") {
                return value;
            }
            return query;
        }

        if (Array.isArray(query)) {
            const res = [];
            for (const e of query) {
                res.push(this._compileQuery(e, value));
            }

            return res;
        }

        const res = {};
        for (const propName of Object.keys(query)) {
            const prop = query[propName];
            res[propName] = this._compileQuery(prop, value);
        }

        return res;
    }

    _mergeItems(prevItem, item) {
        const keys = Object.keys(item);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const val = item[key];
            if (val === null || typeof val === "undefined") {
                delete prevItem[key];
                continue;
            }

            let { $inc } = val;
            if ($inc != null) {
                $inc = $inc * 1;
                if (isNaN($inc)) {
                    return new Error(`Inc value is not a number: ${val.$inc}`);
                }

                const prevVal = prevItem[key] ? prevItem[key] * 1 : 0;
                const newVal = prevVal + $inc;
                if (isNaN(newVal)) {
                    return new Error(`New value is not a number: ${newVal}`);
                }
                item[key] = newVal;
                continue;
            }

            const { $push } = val;
            if ($push != null) {
                const prevVal = prevItem[key] == null ? [] : prevItem[key];
                if (!Array.isArray(prevVal)) {
                    return new Error(`prevValue ${key} for pushing is not an array`);
                }

                if (Array.isArray($push)) {
                    prevVal.push(...$push);
                } else {
                    prevVal.push($push);
                }

                item[key] = prevVal;
            }
        }
        Object.assign(prevItem, item);
    }

    __connect() {
        if (!this.mongoUri) {
            return;
        }
        console.info(`DB connection init. Connection URI: "${this.mongoUri}"`);
        MongoClient.connect(
            this.mongoUri,
            {
                autoReconnect: false,
                useNewUrlParser: true,
            },
            (err, client) => {
                if (err) {
                    console.error("DB connection error:", err);
                    this._timeout = this._timeout < 8000 ? this._timeout + this._timeout : this._timeout;
                    setTimeout(() => {
                        this.__connect();
                    }, this._timeout);
                    return;
                }
                this._timeout = 500;
                console.info(`Connected successfully to DB. Connection URI: "${this.mongoUri}"`);

                this.client = client;
                this.db = client.db();
                this.connected = true;
                this.resolveConnection();
                this.emit("connected");

                client.on("error", err => {
                    console.error("Error on connection to", err);
                    this.connected = false;
                    this.__connect();
                });
                client.on("reconnect", _db => {
                    this.connected = true;
                    this.resolveConnection();
                    console.info(`Reconnected to mongo. Connection URI: "${this.mongoUri}"`);
                });
                client.on("close", _db => {
                    this.connected = false;
                    this.waitForConnection = new Promise((f, r) => {
                        this.resolveConnection = f;
                    });
                    console.error("Connection to mongo closed");
                    this.__connect();
                });
                client.on("timeout", _db => {
                    this.connected = false;
                    this.waitForConnection = new Promise((f, r) => {
                        this.resolveConnection = f;
                    });
                    console.error("Connection to mongo timeout", _db);
                    this.__connect();
                });
            }
        );
    }

    createIndexes(storeName, storeDesc) {
        const config = configStore.getConfig();
        for (const storeName of Object.keys(config)) {
            const storeDesc = config[storeName];
            (storeDesc.indexes || []).forEach(idx => {
                const ticker = setInterval(() => {
                    db.createIndex(storeName, idx, (err, res) => {
                        if (err) {
                            if (err.message === errNotConnectedMessage) {
                                return;
                            }
                            console.error("Error when creating index for store", storeName, idx, err);
                        }

                        console.debug("Index created for store", storeName, idx, res);
                        clearInterval(ticker);
                    });
                }, 500);
            });
        }
    }
}

const db = new DB();
module.exports = db;
