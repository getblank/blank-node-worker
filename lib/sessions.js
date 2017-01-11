"use strict";

let EventEmitter = require("events");
let errNotConnected = new Error("not connected");

class Sessions extends EventEmitter {
    constructor() {
        super();
        this.wampClient = null;
        this.sessions = {};
        this.userScriptApi = {
            get: this.get.bind(this),
            getSubscribers: this.getSubscribers.bind(this),
            on: this.on.bind(this),
            removeListener: this.removeListener.bind(this),
            new: this.new.bind(this),
            check: this.check.bind(this),
            delete: this.delete.bind(this),
        };
    }

    check(apiKey, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        if (this.wampClient == null) {
            cb(errNotConnected);
            return d;
        }
        this.wampClient.call("session.check", (res, err) => cb(err, res), apiKey);
        return d;
    }

    connected(wampClient) {
        this.wampClient = wampClient;
        let updateSessions = (msg) => {
            if (!msg) {
                return;
            }
            switch (msg.event) {
                case "updated":
                    this._updated(msg.data);
                    break;
                case "deleted":
                    this._deleted(msg.data);
                    break;
                case "init":
                    this._init(msg.data);
            }
        };
        this.wampClient.subscribe("sessions", updateSessions, updateSessions, (e) => {
            throw new Error("cannot subscribe to sessions", e);
        });
    }

    delete(apiKey, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        if (this.wampClient == null) {
            cb(errNotConnected);
            return d;
        }
        this.wampClient.call("session.delete", (res, err) => console.info(err, res) || cb(err, res), apiKey);
        return d;
    }

    disconnected() {
        this.wampClient = null;
    }

    get(apiKey) {
        if (apiKey) {
            return (this.sessions[apiKey] != null ? Object.assign({}, this.sessions[apiKey]) : null);
        }
        let sList = Object.keys(this.sessions).map(k => Object.assign({ "apiKey": k }, this.sessions[k]));
        return sList;
    }

    getSubscribers(uri) {
        let result = [];
        for (let apiKey of Object.keys(this.sessions)) {
            let session = this.sessions[apiKey];

            session.connections.forEach(conn => {
                for (let _uri of Object.keys(conn.subscriptions || {})) {

                    if (_uri === uri) {
                        let sub = {
                            connId: conn.connId,
                            params: conn.subscriptions[_uri],
                            userId: session.userId,
                        };
                        result.push(sub);
                    }
                }
            });
        }

        return result;
    }

    new(userId, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
        if (this.wampClient == null) {
            cb(errNotConnected);
            return d;
        }
        this.wampClient.call("session.new", (res, err) => cb(err, res), userId);
        return d;
    }

    _deleted(session) {
        if (!session.apiKey) {
            return console.warn("sessions.delete: session without apiKey", session);
        }
        delete this.sessions[session.apiKey];
        this.emit("delete", session);
    }

    _init(data) {
        this.sessions = {};
        (data || []).forEach(session => {
            this._updated(session);
        });
    }

    _updated(session) {
        if (!session.apiKey) {
            return console.warn("sessions.update: session without apiKey", session);
        }
        session.connections = session.connections || [];
        let s = this.sessions[session.apiKey];
        this.sessions[session.apiKey] = session;
        if (s) {
            this.emit("update", session);
        } else {
            this.emit("create", session);
        }
    }
}

var sessions = new Sessions();
module.exports = sessions;