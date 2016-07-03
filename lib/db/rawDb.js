"use strict";

var {MongoClient} = require("mongodb");
var EventEmitter = require("events");
var configStore = require("../configStore");


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

    get(query, store, cb) {
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
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
            this.rawFindOne(query, store, cb);
        });
    }

    find(query, store, cb) {
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        if (!configStore.isStore(store)) {
            return cb(new Error("Store not found"), null);
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
                return cb(new Error("Not found"), null);
            }
            this.rawFindAll(query, store, (err, res) => {
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

    forEach(store, itemCb = () => {}, cb = () => {}) {
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            collection.find({}, function (err, cursor) {
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
                            cursor.next(processItem);
                        } else {
                            cb(null, null);
                        }
                    });
                }
                runNext();
            });
        });
    }

    rawFindOne(query, store, cb) {
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

    rawFindOneAndUpdate(query, update, storeName, cb) {
        let defer;
        if (typeof cb !== "function") {
            defer = new Promise((resolve, reject) => {
                cb = (e, r) => { (e == null) ? resolve(r) : reject(e) };
            });
        }
        if (!this.connected) {
            cb(new Error("Not connected"), null);
        } else {
            this.db.collection(storeName, { strict: false }, (err, collection) => {
                collection.findOneAndUpdate(query, update, { returnOriginal: false, upsert: true }, (err, res) => {
                    if (err) {
                        return cb(err, null);
                    }
                    if (res.ok) {
                        return cb(null, res.value);
                    }
                    return cb(new Error(res.lastErrorObject.MongoError || res.lastErrorObject), null);
                });
            });
        }
        return defer;
    }

    rawFindAll(query, store, cb) {
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            let q = query.query || {};
            let cursor;
            if (query.props && query.props.length > 0) {
                let props = {};
                for (let propName of query.props) {
                    props[propName] = true;
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
                let sortProp = query.orderBy;
                let sortSign = 1;
                if (sortProp[0] === "-") {
                    sortProp = sortProp.slice(1);
                    sortSign = -1;
                }
                let sortQuery = {};
                sortQuery[sortProp] = sortSign;
                cursor = cursor.sort(sortQuery);
            }
            cursor.toArray((err, result) => {
                if (err) {
                    return cb(err, null);
                }
                cb(null, result || []);
            });
        });
    }

    setup(mongoUri) {
        if (this.mongoUri !== mongoUri) {
            this.mongoUri = mongoUri;
            this.__connect();
        }
    }

    _insertMany(data, store, cb = () => { }) {
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        this.db.collection(store, { strict: false }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            collection.insertMany(data, { strict: false }, cb);
        });
    }

    _set(id, store, data, cb = () => { }) {
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

    _delete(id, store, cb = () => { }) {
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

    _dropCollection(store, cb = () => { }) {
        if (!this.connected) {
            return cb(new Error("Not connected"), null);
        }
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb();
            }
            collection.drop(cb);
        });
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
}

let db = new Db();
module.exports = db;