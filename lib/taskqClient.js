"use strict";

var WampClient = require("wamp");

let wampClient = new WampClient(true, true),
    _uri = null;

module.exports.wampClient = wampClient;

module.exports.setup = function (uri) {
    if (_uri != uri) {
        _uri = uri;
        if (wampClient.state == null || wampClient.state == 3) {
            connect();
        } else {
            wampClient.onclose = connect;
            wampClient.close();
        }
    }
};

function connect() {
    wampClient.onclose = null;
    if (_uri) {
        wampClient.open(_uri);
    }
}

setInterval(() => {console.log(wampClient.state)}, 3000);