"use strict";

import minimist from "minimist";
import WampClient from "wamp";
import "./taskRunner";
import taskqClient from "./taskqClient";
import configStore from "./configStore";
import db from "./db";
import consoleHandler from "./consoleHandler";
import sessions from "./sessions";
import "./db/events";
import {register as registerModule} from "./userScriptRequire";
consoleHandler.setup("debug");

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
    subscribeToSessions();
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

function subscribeToSessions() {
    var updateSessions = function (data) {
        if (!data) {
            return;
        }
        switch (data.event) {
            case "updated":
                sessions.update(data.data);
                break;
            case "deleted":
                sessions.delete(data.data);
                break;
            case "init":
                sessions.init(data.data);
        }
    };
    wampClient.subscribe("sessions", updateSessions, updateSessions, () => {
        if (_connected) {
            subscribeToSessions();
        }
    });
}

function subscribeToConfig() {
    var updateConfig = function (data) {
        console.log("Config received");
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
    console.log("Modules setup started");
    configStore.setup(_config);
    db.setup("mongodb://localhost:27017/blank");
    if (_serviceRegistry.pbx && _serviceRegistry.pbx[0]) {
        let firstPBX = _serviceRegistry.pbx[0];
        registerModule("pbx", firstPBX.address, firstPBX.port, firstPBX.commonJS);
        console.info(`Module "pbx" registered. Address: "${firstPBX.address}"; port: "${firstPBX.port}"`);
    }
    if (configStore.isReady()) {
        let taskQueueList = _serviceRegistry.taskQueue || [],
            firstTQ = taskQueueList[0];
        if (firstTQ && firstTQ.address) {
            taskqClient.setup(firstTQ.address + (firstTQ.port ? ":" + firstTQ.port : ""));
        }
    } else {
        taskqClient.setup(null);
    }
    console.log("Modules setup finished");
}