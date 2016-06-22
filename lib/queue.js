let WampClient = require("wamp");
let serviceRegistry = require("./serviceRegistry");

let queueUri, _connected;

let wampClient = new WampClient(true, true);

wampClient.onopen = function () {
    console.info(`Connection to queue microservice: ${queueUri} established`);
    _connected = true;
};
wampClient.onclose = function () {
    console.info("Connection to queue microservice closed.");
    _connected = false;
};


function _push(queue, item, cb = () => {}) {
    wampClient.call("push", cb, queue, item);
}

function _remove(queue, item, cb = () => {}) {
    if (!item._id) {
        return cb(new Error("no _id in item"));
    }
    wampClient.call("remove", cb, queue, item._id);
}

function _unshift(queue, cb) {
    wampClient.call("unshift", cb, queue);
}

function _length(queue, cb) {
    wampClient.call("length", cb, queue);
}

function _srUpdate() {
    let uri = serviceRegistry.getQueueAddress();
    if (!uri) {
        return;
    }
    if (uri !== uri && _connected) {
        wampClient.close();
    }
    if (queueUri === uri) {
        return;
    }
    queueUri = uri;
    if (!_connected) {
        wampClient.open(queueUri);
    }
}

module.exports.push = _push;
module.exports.remove = _remove;
module.exports.unshift = _unshift;
module.exports.length = _length;
module.exports.srUpdate = _srUpdate;
