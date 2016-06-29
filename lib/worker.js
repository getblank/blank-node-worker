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
let sync = require("./sync");
let localStorage = require("./localStorage");
let queue = require("./queue");
let events = require("./db/events");
require("./taskRunner");
consoleHandler.setup("debug");

userScript.setup({
    "mutex": sync,
    "sync": sync,
    "localStorage": localStorage,
    "sessions": sessions.userScriptApi,
    "$db": db,
});

global.WebSocket = require("ws");
let wampClient = new WampClient(true, true),
    _config = null,
    _libsReady = false;

wampClient.onopen = function () {
    console.info("Connection to " + srUri + " established");
    wampClient.call("register", (data, err) => {
        err && console.log("Error while registering on SR:", err);
    }, { "type": "worker" });
    subscribeToSR();
    subscribeToConfig();
    subscribeToSessions();
    sync.setup(wampClient);
    localStorage.setup(wampClient);
    events.setup(wampClient);
};
wampClient.onclose = function () {
    console.info("Connection closed.");
    sync.setup(null);
    localStorage.setup(null);
    events.setup(null);
};
let argv = minimist(process.argv.slice(2));
let srUri = argv.sr || argv._[0] || process.env.BLANK_SERVICE_REGISTRY || "ws://localhost:1234";
if (!srUri) {
    throw new Error("Service registry address not provided!");
}
console.info(`Connecting to ${srUri}`);
wampClient.open(srUri);

function subscribeToSR() {
    var updateRegistry = function (data) {
        console.log("SR update:", data);
        serviceRegistry.update(data);
        setupModules();
    };
    wampClient.subscribe("registry", updateRegistry, updateRegistry, (e) => {
        throw new Error("cannot subscribe to service registry", e);
    });
}

function subscribeToSessions() {
    var updateSessions = function (msg) {
        if (!msg) {
            return;
        }
        switch (msg.event) {
            case "updated":
                sessions.update(msg.data);
                break;
            case "deleted":
                sessions.delete(msg.data);
                break;
            case "init":
                sessions.init(msg.data);
        }
    };
    wampClient.subscribe("sessions", updateSessions, updateSessions, (e) => {
        throw new Error("cannot subscribe to sessions", e);
    });
}

function subscribeToConfig() {
    var updateConfig = function (data) {
        console.log("Config received");
        _config = data;
        loadLibs();
        setupModules();
    };
    wampClient.subscribe("config", updateConfig, updateConfig, (e) => {
        throw new Error("cannot subscribe to config", e);
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
                console.log("Libs loaded cb!");
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
    queue.srUpdate();
    console.log("Modules setup finished");
}