"use strict";

// type Session struct {
// 	APIKey            string    `json:"apiKey"`
// 	UserID            string    `json:"userId"`
// 	Connections       []*Conn   `json:"connections"`
// 	LastRequest       time.Time `json:"lastRequest"`
// 	connectionsLocker sync.RWMutex
// 	ttl               time.Duration
// }

// Conn represents WAMP connection in session
// type Conn struct {
// 	ConnID        string                 `json:"connId"`
// 	Subscriptions map[string]interface{} `json:"subscriptions"`
// }


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
                console.info(_uri, uri, _uri === uri);
                if (_uri === uri) {
                    let sub = {
                        connId: conn.connId,
                        params: conn.subscriptions[_uri],
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
    sessions[session.apiKey] = session;
};


exports.delete = del;
exports.get = get;
exports.getSubscribers = getSubscribers;
exports.update = update;

if (process.env.TESTING === "TESTING") {
    exports.sessions = sessions;
}