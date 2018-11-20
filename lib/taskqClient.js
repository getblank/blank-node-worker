"use strict";

const WampClient = require("wamp");

const wampClient = new WampClient(true, true);
let _uri = null;

module.exports.wampClient = wampClient;

module.exports.setup = uri => {
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

const connect = () => {
    wampClient.onclose = null;
    if (_uri) {
        wampClient.open(_uri);
    }
};

setInterval(() => {
    console.log(wampClient.state);
}, 3000);
