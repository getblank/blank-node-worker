"use strict";

import {MongoClient} from "mongodb";
import EventEmitter from "events";
import configStore from "../configStore";


class Db extends EventEmitter {
    constructor() {
        super();
        this.db = null;
        this.mongoUri = null;
        this.connected = false;
    }

    get(query, store, cb) {
        if (!configStore.isStore(store)) {
            return cb(new Error("Store not found"), null);
        }

        if (typeof query === "string") {
            query = { _id: query };
        }
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            this.rawFindOne(query, store, cb);
        });
    }

    find(query, store, cb) {
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

    rawFindOne(query, store, cb) {
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }

            collection.findOne(query, {}, (err, result) => {
                if (err) {
                    return cb(err, null);
                }
                if (result === null) {
                    return cb(new Error("Not found"), null);
                }
                cb(null, result);
            });
        });
    }

    rawFindAll(query, store, cb) {
        this.db.collection(store, { strict: true }, (err, collection) => {
            if (err) {
                return cb(err, null);
            }
            let q = query.query || {};
            let cursor = collection.find(q);
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
        let collection = this.db.collection(store);
        collection.insertMany(data, { strict: false }, cb);
    }

    _set(id, store, data, cb = () => { }) {
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
        let storeDesc = configStore.getStoreDesc(store);
        if (storeDesc == null) {
            throw new Error("Store not found");
        }
        let collection = this.db.collection(store);
        collection.remove({ "_id": id }, { single: true }, (err, result) => {
            if (err) {
                cb(err, null);
                return;
            }
            cb(null, result);
        });
    }

    _dropCollection(store, cb = () => { }) {
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

    __connect() {
        if (!this.mongoUri) {
            return;
        }
        MongoClient.connect(this.mongoUri, {
            autoReconnect: true,
            reconnectTries: 86400,
            reconnectInterval: 1000,
        }, (err, db) => {
            if (err) {
                console.log("DB connection error:", err);
                return;
            }
            console.log("Connected successfully to DB");

            this.db = db;
            this.connected = true;
            this.emit("connected");

            db.on("error", (err) => {
                console.error("Error on connection to", err);
            });
            db.on("reconnect", (_db) => {
                this.connected = true;
                console.log("Reconnected to mongo");
            });
            db.on("close", (_db) => {
                this.connected = false;
                console.log("Connection to mongo closed");
            });
        });
    }
}

let db = new Db();
// export default db;
module.exports = db;