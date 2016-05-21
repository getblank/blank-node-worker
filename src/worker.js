"use strict";

import minimist from "minimist";
import WampClient from "wamp";
import taskRunner from "./taskRunner";
import configStore from "./configStore";
import db from "./db";

global.WebSocket = require("ws");
let wampClient = new WampClient(true, true),
    _connected = false,
    _serviceRegistry = {},
    _config = null;

wampClient.onopen = function () {
    console.info("Connection to " + srUri + " established");
    _connected = true;
    wampClient.call("register", (data, err) => {
        err && console.log("Error while registering on SR:", err);
    }, { "type": "worker" });
    subscribeToSR();
    subscribeToConfig();
};
wampClient.onclose = function () {
    console.info("Connection closed.");
    _connected = false;
};
let argv = minimist(process.argv.slice(2));
let srUri = argv.sr || argv._[0] || process.env.BLANK_SERVICE_REGISTRY;
if (!srUri) {
    throw new Error("Service registry address not provided!");
}
console.info(`Connecting to ${srUri}`);
wampClient.open(srUri);

function subscribeToSR() {
    var updateRegistry = function (data) {
        _serviceRegistry = data || {};
        setupModules();
    };
    wampClient.subscribe("registry", updateRegistry, updateRegistry, () => {
        if (_connected) {
            subscribeToSR();
        }
    });
}

function subscribeToConfig() {
    var updateConfig = function (data) {
        _config = data;
        setupModules();
    };
    wampClient.subscribe("config", updateConfig, updateConfig, () => {
        if (_connected) {
            subscribeToConfig();
        }
    });
}

function setupModules() {
    configStore.setup(_config);
    db.setup("mongodb://localhost:27017/blank");
    let taskQueueList = _serviceRegistry.taskQueue || [],
        firstTQ = taskQueueList[0] || {};
    if (firstTQ) {
        taskRunner.setup(firstTQ.address + ":" + firstTQ.port);
    }
}