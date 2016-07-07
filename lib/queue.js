let WampClient = require("wamp");
let serviceRegistry = require("./serviceRegistry");

let queueUri;

let wampClient = new WampClient(true, true);


class List {
    constructor(name) {
        if (typeof name !== "string" || !name) {
            throw new Error("list name not provided");
        }
        this._name = name;
        this._cursor = 0;
    }

    front(cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        wampClient.call("list.front", (r, err) => {
            if (err) {
                return cb(err, null);
            }
            this._cursor = r.position;
            cb(err, r.element);
        }, this._name);

        return d;
    }

    back(cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        wampClient.call("list.back", (r, err) => {
            if (err) {
                return cb(err, null);
            }
            this._cursor = r.position;
            cb(err, r.element);
        }, this._name);

        return d;
    }


    pushFront(element, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        wampClient.call("list.pushFront", (r, err) => {
            if (err) {
                return cb(err, null);
            }
            cb(err, null);
        }, this._name, element);

        return d;
    }

    pushBack(element, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        wampClient.call("list.pushBack", (r, err) => {
            if (err) {
                return cb(err, null);
            }
            cb(err, null);
        }, this._name, element);

        return d;
    }

    next(cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        wampClient.call("list.next", (r, err) => {
            if (err) {
                return cb(err, null);
            }
            this._cursor = r.position;
            cb(err, r.element);
        }, this._name, this._cursor);

        return d;
    }

    prev(cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        wampClient.call("list.prev", (r, err) => {
            if (err) {
                return cb(err, null);
            }
            this._cursor = r.position;
            cb(err, r.element);
        }, this._name, this._cursor);

        return d;
    }

    getById(id, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        wampClient.call("list.getById", (r, err) => {
            if (err) {
                return cb(err, null);
            }
            cb(err, r.element);
        }, this._name, id);

        return d;
    }

    remove(element, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        if  ( typeof element._id !== "string" || !element._id) {
            throw new Error("no _id in element");
        }
        wampClient.call("list.removeById", (r, err) => {
            cb(err);
        }, this._name, element._id);

        return d;
    }

    update(element, cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        if  ( typeof element._id !== "string" || !element._id) {
            throw new Error("no _id in item");
        }
        wampClient.call("list.updateById", (r, err) => {
            cb(err);
        }, this._name, element);

        return d;
    }

    drop(cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        wampClient.call("list.drop", (r, err) => {
            cb(err);
        }, this._name);

        return d;
    }

    position() {
        return this._cursor;
    }

    gotoPosition(position) {
        position = parseInt(position);
        if (isNaN(position)) {
            throw new Error("position must be int");
        }
        this._cursor = position;
    }

    length(cb) {
        let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;

        if (wampClient.state !== 1) {
            cb(new Error("not connected"));
            return d;
        }
        wampClient.call("list.length", (r, err) => {
            cb(err, r);
        }, this._name);

        return d;
    }
}

function __connect() {
    wampClient.onclose = null;
    if (queueUri) {
        wampClient.open(queueUri);
    }
}

function _drop(queue, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    wampClient.call("queue.drop", (r, e) => cb(e, r), queue);
    return d;
}

function _get(queue, _id, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    wampClient.call("queue.get", (r, e) => cb(e, r), queue, _id);
    return d;
}

function _push(queue, item, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    wampClient.call("queue.push", (r, e) => cb(e, r), queue, item);
    return d;
}

function _remove(queue, item, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    if (!item._id) {
        return cb(new Error("no _id in item"));
    }
    wampClient.call("queue.remove", (r, e) => cb(e, r), queue, item._id);
    return d;
}

function _shift(queue, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    wampClient.call("queue.shift", (r, e) => cb(e, r), queue);
    return d;
}

function _unshift(queue, item, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    wampClient.call("queue.unshift", (r, e) => cb(e, r), queue, item);
    return d;
}

function _length(queue, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    wampClient.call("queue.length", (r, e) => cb(e, r), queue);
    return d;
}

function _srUpdate() {
    let uri = serviceRegistry.getQueueAddress();
    if (!uri) {
        return;
    }
    if (uri != queueUri) {
        queueUri = uri;
        if (wampClient.state == null || wampClient.state == 3) {
            __connect();
        } else {
            wampClient.onclose = __connect;
            wampClient.close();
        }
    }
}

module.exports.drop = _drop;
module.exports.get = _get;
module.exports.push = _push;
module.exports.remove = _remove;
module.exports.shift = _shift;
module.exports.unshift = _unshift;
module.exports.length = _length;
module.exports.srUpdate = _srUpdate;

module.exports.List = List;
