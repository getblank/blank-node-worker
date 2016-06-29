"use strict";

var EventEmitter = require("events");

class Sessions extends EventEmitter {
    constructor() {
        super();
        this.sessions = {};
        this.userScriptApi = {
            "get": this.get.bind(this),
            "getSubscribers": this.getSubscribers.bind(this),
            "on": this.on.bind(this),
            "removeListener": this.removeListener.bind(this),
        };
    }

    init(data) {
        this.sessions = {};
        (data || []).forEach(session => {
            this.update(session);
        });
    }

    get(apiKey) {
        return this.sessions[apiKey];
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
                            user: session.user,
                        };
                        result.push(sub);
                    }
                }
            });
        }

        return result;
    }

    update(session) {
        if (!session.apiKey) {
            return console.warn("Session without apiKey", session);
        }
        session.connections = session.connections || [];
        let s = this.sessions[session.apiKey];
        this.sessions[session.apiKey] = session;
        if (s) {
            session.user = session.user || s.user;
            this.emit("update", session);
        } else {
            this.emit("create", session);
        }
    }

    delete(apiKey) {
        let s = this.sessions[apiKey];
        delete this.sessions[apiKey];
        if (s) {
            this.emit("delete", s);
        }
    }
}

var sessions = new Sessions();
module.exports = sessions;