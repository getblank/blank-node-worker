"use strict";

var {MongoClient} = require("mongodb");
var EventEmitter = require("events");
var configStore = require("../configStore");

function getCollectionName(storeName) {
    return configStore.getMongoCollectionName(storeName);
}

class Db extends EventEmitter {
    constructor() {
        super();
        this.db = null;
        this.mongoUri = null;
        this.connected = false;
        this.waitForConnection = new Promise((f, r) => {
            this.resolveConnection = f;
        });
        this._timeout = 250;
    }

    createIndex(store, idx, cb) {
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
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

    get(store, query, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        store = getCollectionName(store);
        if (!this.connected) {
            cb(new Error("Not connected"), null);
            return d;
        }
        if (typeof query === "string") {
            query = { _id: query };
        }
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                if (/collection.*does not exist/i.test(err.message)) {
                    return cb(new Error("Not found"), null);
                }
                return cb(err, null);
            }
            this.rawFindOne(store, query, cb);
        });
        return d;
    }

    find(store, query, cb) {
        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        let result = {
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
            this.rawFindAll(store, query, (err, res) => {
                if (err) {
                    return cb(err, null);
                }
                if (!res) {
                    return cb(null, result);
                }
                result.items = res;
                if (!query.skip && !query.take) {
                    result.count = res.length;
                    return cb(null, result);
                }
                collection.find(query.query || {}).count((err, res) => {
                    result.count = res;
                    cb(null, result);
                });
            });
        });
    }

    forEach(store, query, itemCb = () => { }, cb = () => { }) {
        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            collection.find(query, function (err, cursor) {
                function processItem(err, item) {
                    let res = itemCb(item);
                    if (res instanceof Promise) {
                        res.then(() => runNext());
                    } else {
                        runNext();
                    }
                }
                function runNext() {
                    cursor.hasNext(function (err, hasNext) {
                        if (hasNext && err == null) {
                            return cursor.next(processItem);
                        }
                        cb(null, null);
                    });
                }
                runNext();
            });
        });
    }

    insert(storeName, item, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        storeName = getCollectionName(storeName);

        if (!item._id) {
            cb(new Error("Now _id in item"), null);
            return d;
        }

        if (!this.connected) {
            cb(new Error("Not connected"), null);
            return d;
        }

        this.db.collection(storeName, { strict: false }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }

            collection.insertOne(item, {}, (err, res) => {
                if (err) {
                    return cb(err, null);
                }

                if (!res) {
                    return cb(new Error("Not found"), null);
                }

                if (res.result.ok) {
                    return cb(null, item);
                }

                return cb(new Error("Insert failed"), null);
            });
        });

        return d;
    }

    rawFindOne(store, query, cb) {
        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }

            collection.findOne(query, {}, (err, result) => {
                if (err) {
                    return cb(err, null);
                }
                if (result == null) {
                    return cb(new Error("Not found"), null);
                }
                cb(null, result);
            });
        });
    }

    rawFindOneAndUpdate(storeName, query, update, upsert, cb) {
        storeName = getCollectionName(storeName);
        let defer;
        if (typeof cb !== "function") {
            defer = new Promise((resolve, reject) => {
                cb = (e, r) => { (e == null) ? resolve(r) : reject(e) };
            });
        }
        if (!this.connected) {
            cb(new Error("Not connected"), null);
            return defer;
        }
        this.db.collection(storeName, { strict: false }, (err, collection) => {
            collection.findOneAndUpdate(query, update, { returnOriginal: false, upsert: upsert }, (err, res) => {
                if (err) {
                    return cb(err, null);
                }
                if (res.ok && res.value != null) {
                    return cb(null, res.value);
                }
                return cb(new Error(res.lastErrorObject && (res.lastErrorObject.MongoError || res.lastErrorObject) || res), null);
            });
        });

        return defer;
    }

    rawFindAll(store, query, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        store = getCollectionName(store);
        if (!this.connected) {
            cb(new Error("Not connected"), null);

            return d;
        }
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }

            let q = query.query || {};
            let cursor;

            if (query.props) {
                let props = {};
                if (Array.isArray(query.props) && query.props.length > 0) {
                    for (let propName of query.props) {
                        props[propName] = true;
                    }
                } else {
                    Object.assign(props, query.props);
                }
                cursor = collection.find(q, props);
            } else {
                cursor = collection.find(q);
            }

            if (query.skip != null) {
                cursor = cursor.skip(query.skip);
            }

            if (query.take != null) {
                cursor = cursor.limit(query.take);
            }

            if (query.orderBy != null) {
                if (typeof query.orderBy === "string") {
                    let sortProp = query.orderBy;
                    let sortSign = 1;
                    if (sortProp[0] === "-") {
                        sortProp = sortProp.slice(1);
                        sortSign = -1;
                    }
                    let sortQuery = {};
                    sortQuery[sortProp] = sortSign;
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
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        this.db.collection(store, { strict: false }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            collection.insertMany(data, { strict: false }, cb);
        });

        return d;
    }

    _set(store, id, data, cb = () => { }) {
        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        this.db.collection(store, { strict: false }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            collection.updateOne({ "_id": id }, { $set: data }, { upsert: true }, (err, res) => {
                if (err) {
                    return cb(err, null);
                }
                cb(null, data);
            });
        });
    }

    _delete(store, id, cb = () => { }) {
        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err);
            }
            collection.remove({ "_id": id }, { single: true }, (err, result) => {
                if (err) {
                    return cb(err, null);
                }
                cb(null, result);
            });
        });
    }

    _dropCollection(store, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;

        store = getCollectionName(store);
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
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
            let res = [];
            for (let e of query) {
                res.push(this._compileQuery(e, value));
            }
            return res;
        }
        let res = {};
        for (let propName of Object.keys(query)) {
            let prop = query[propName];
            res[propName] = this._compileQuery(prop, value);
        }
        return res;
    }

    _mergeItems(prevItem, item) {
        let keys = Object.keys(item);
        for (let i = 0; i < keys.length; i++) {
            let key = keys[i];
            let val = item[key];
            if (val === null || typeof val === "undefined") {
                delete prevItem[key];
                continue;
            }
            let inc = val.$inc;
            if (inc != null) {
                inc = inc * 1;
                if (isNaN(inc)) {
                    return new Error(`Inc value is not a number: ${val.$inc}`);
                }
                let prevVal = prevItem[key];
                prevVal = prevVal ? prevVal * 1 : 0;
                let newVal = prevVal + inc;
                if (isNaN(newVal)) {
                    return new Error(`New value is not a number: ${newVal}`);
                }
                item[key] = newVal;
                continue;
            }
            let $push = val.$push;
            if ($push != null) {
                let prevVal = prevItem[key];
                prevVal = (typeof prevVal === "undefined") ? [] : prevVal;
                if (!Array.isArray(prevVal)) {
                    return new Error(`prevValue ${key} for pushing is not an array`);
                }
                prevVal.push($push);
                item[key] = prevVal;
            }
        }
        Object.assign(prevItem, item);
    }

    __connect() {
        if (!this.mongoUri) {
            return;
        }
        MongoClient.connect(this.mongoUri, {
            autoReconnect: false,
        }, (err, db) => {
            if (err) {
                console.log("DB connection error:", err);
                this._timeout = this._timeout < 8000 ? this._timeout + this._timeout : this._timeout;
                setTimeout(() => {
                    this.__connect();
                }, this._timeout);
                return;
            }
            this._timeout = 500;
            console.log("Connected successfully to DB");

            this.db = db;
            this.connected = true;
            this.resolveConnection();
            this.emit("connected");

            db.on("error", (err) => {
                console.error("Error on connection to", err);
                this.connected = false;
                this.__connect();
            });
            db.on("reconnect", (_db) => {
                this.connected = true;
                this.resolveConnection();
                console.log("Reconnected to mongo");
            });
            db.on("close", (_db) => {
                this.connected = false;
                this.waitForConnection = new Promise((f, r) => {
                    this.resolveConnection = f;
                });
                console.error("Connection to mongo closed");
                this.__connect();
            });
            db.on("timeout", (_db) => {
                this.connected = false;
                this.waitForConnection = new Promise((f, r) => {
                    this.resolveConnection = f;
                });
                console.error("Connection to mongo timeout", _db);
                this.__connect();
            });
        });
    }

    createIndexes(storeName, storeDesc) {
        let config = configStore.getConfig();
        for (let storeName of Object.keys(config)) {
            let storeDesc = config[storeName];
            (storeDesc.indexes || []).forEach((idx) => {
                let ticker = setInterval(() => {
                    db.createIndex(storeName, idx, (err, res) => {
                        if (err) {
                            if (err.message === "Not connected") {
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

let db = new Db();
module.exports = db;