"use strict";

let sessions = {};

let del = (apiKey) => {
    delete sessions[apiKey];
};

let get = (apiKey) => {
    return sessions[apiKey];
};

let getSubscribers = (uri) => {
    let result = [];
    for (let apiKey of Object.keys(sessions)) {
        let session = sessions[apiKey];

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
};

let update = (session) => {
    if (!session.apiKey) {
        return console.warn("Session without apiKey", session);
    }
    session.connections = session.connections || [];
    let s = sessions[session.apiKey];
    sessions[session.apiKey] = session;
    if (s && !session.user) {
        session.user = s.user;
    }
};

let init = (data) => {
    sessions = {};
    (data || []).forEach(session => {
        update(session);
    });
};

exports.delete = del;
exports.get = get;
exports.getSubscribers = getSubscribers;
exports.update = update;
exports.init = init;

if (process.env.NODE_ENV === "test") {
    exports.sessions = sessions;
}