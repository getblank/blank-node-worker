"use strict";

import WampClient from "wamp";

let wampClient = new WampClient(true, true),
    _uri = null,
    _connectTimer = null;


module.exports.wampClient = wampClient;

module.exports.setup = function (uri) {
    if (uri != _uri) {
        _uri = uri;
        wampClient.close();
        if (uri) {
            clearTimeout(_connectTimer);
            _connectTimer = setTimeout(() => {
                console.log(`Connecting to TaskQueue: ${uri}`);
                wampClient.open(uri);
            }, 300);
        }
    }
};
