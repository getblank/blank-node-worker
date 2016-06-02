"use strict";
process.title = "blank-node-worker";
let http = require("http");
let minimist = require("minimist");
let WampClient = require("wamp");
let taskqClient = require("./taskqClient");
let configStore = require("./configStore");
let db = require("./db");
let consoleHandler = require("./consoleHandler");
let sessions = require("./sessions");
let userScript = require("./userScript");
let serviceRegistry = require("./serviceRegistry");
let mutex = require("./mutex");
require("./taskRunner");
require("./db/events");
consoleHandler.setup("debug");

global.WebSocket = require("ws");
let wampClient = new WampClient(true, true),
    _connected = false,
    _config = null,
    _libsReady = false;

wampClient.onopen = function () {
    console.info("Connection to " + srUri + " established");
    _connected = true;
    wampClient.call("register", (data, err) => {
        err && console.log("Error while registering on SR:", err);
    }, { "type": "worker" });
    subscribeToSR();
    subscribeToConfig();
    subscribeToSessions();
    mutex.setup(
        (id, cb) => { wampClient.call("mutex.lock", cb, id) },
        (id, cb) => { wampClient.call("mutex.unlock", cb, id) }
    );
};
wampClient.onclose = function () {
    console.info("Connection closed.");
    _connected = false;
    mutex.setup(null, null);
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
        serviceRegistry.update(data);
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
        loadLibs();
        setupModules();
    };
    wampClient.subscribe("config", updateConfig, updateConfig, () => {
        if (_connected) {
            subscribeToConfig();
        }
    });
}

function loadLibs() {
    _libsReady = false;
    let uri = srUri.replace("ws://", "http://");
    uri += (uri[uri.length - 1] === "/" ? "" : "/") + "lib/";
    console.log("Loading libs from:", uri);
    http.get(uri, (res) => {
        if (res.statusCode !== 200) {
            console.log("Libs load error:", res.statusCode);
            setupModules();
            return;
        }
        var data = [], dataLen = 0;
        res.on("data", function (chunk) {
            data.push(chunk);
            dataLen += chunk.length;
        });
        res.on("end", function () {
            var buf = Buffer.concat(data);
            userScript.require.registerZip(buf, (err) => {
                _libsReady = true;
                setupModules();
            });
        });
    }).on("error", (e) => {
        console.log(`Libs load error: ${e.message}`);
        _libsReady = false;
        setupModules();
        return;
    });
}

function setupModules() {
    console.log("Modules setup started");
    configStore.setup(_config);
    let mongoUri = "mongodb://" + (process.env.MONGO_PORT_27017_TCP_ADDR ? `${process.env.MONGO_PORT_27017_TCP_ADDR}:${process.env.MONGO_PORT_27017_TCP_PORT}` : "localhost:27017") + "/blank";
    db.setup(mongoUri);
    if (serviceRegistry.getPBX()) {
        let firstPBX = serviceRegistry.getPBX();
        userScript.require.register("pbx", firstPBX.commonJS, firstPBX.address, firstPBX.port);
        console.info(`Module "pbx" registered. Address: "${firstPBX.address}"; port: "${firstPBX.port}"`);
    }
    if (configStore.isReady() && _libsReady) {
        let firstTQ = serviceRegistry.getTaskQueueAddress();
        taskqClient.setup(firstTQ);
    } else {
        taskqClient.setup(null);
    }
    console.log("Modules setup finished");
}