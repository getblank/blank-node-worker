let WampClient = require("wamp");
let serviceRegistry = require("./serviceRegistry");

let queueUri;

let wampClient = new WampClient(true, true);

function connect() {
    wampClient.onclose = null;
    if (queueUri) {
        wampClient.open(queueUri);
    }
}

function _push(queue, item, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    wampClient.call("push", cb, queue, item);
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
    wampClient.call("remove", cb, queue, item._id);
    return d;
}

function _unshift(queue, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    wampClient.call("unshift", cb, queue);
    return d;
}

function _length(queue, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    if (wampClient.state !== 1) {
        return cb(new Error("not connected"));
    }
    wampClient.call("length", cb, queue);
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
            connect();
        } else {
            wampClient.onclose = connect;
            wampClient.close();
        }
    }
}

module.exports.push = _push;
module.exports.remove = _remove;
module.exports.unshift = _unshift;
module.exports.length = _length;
module.exports.srUpdate = _srUpdate;