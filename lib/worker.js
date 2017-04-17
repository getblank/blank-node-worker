"use strict";

process.title = process.env.WORKER_NAME || "blank-node-worker";

process.on("uncaughtException", (err) => {
    console.error(`\n${new Date()} Caught exception: ${err.message}\n${err.stack}\n`);
    process.exit(1);
});

const http = require("http");
const minimist = require("minimist");
const WampClient = require("wamp");
const taskqClient = require("./taskqClient");
const configStore = require("./configStore");
const db = require("./db");
const rawDb = require("./db/rawDb");
const consoleHandler = require("./consoleHandler");
const sessions = require("./sessions");
const usersCache = require("./usersCache");
const userScript = require("./userScript");
const serviceRegistry = require("./serviceRegistry");
const sync = require("./sync");
const localStorage = require("./localStorage");
const queue = require("./queue");
const events = require("./db/events");
const customFS = require("./fs");
require("./taskRunner");
require("./promiseSeries");
consoleHandler.setup("debug");

userScript.setup({
    mutex: sync,
    sync: sync,
    localStorage: localStorage,
    sessions: sessions.userScriptApi,
    $db: db,
});

global.WebSocket = require("ws");
const mongoUri = `mongodb://${process.env.MONGO_PORT_27017_TCP_ADDR || "localhost"}:${process.env.MONGO_PORT_27017_TCP_PORT || "27017"}/${process.env.MONGO_PORT_27017_DB_NAME || "blank"}`;
const wampClient = new WampClient(true, true);
let _libsReady = false;
let _started = false;

wampClient.onopen = function () {
    console.info("Connection to " + srUri + " established");
    wampClient.call("register", (data, err) => {
        err && console.log("Error while registering on SR:", err);
    }, { type: "worker" });
    subscribeToSR();
    subscribeToConfig();
    sessions.connected(wampClient);
    subscribeToUsers();
    sync.setup(wampClient);
    localStorage.setup(wampClient);
    events.setup(wampClient);
};
wampClient.onclose = function () {
    console.info("Connection closed.");
    sync.setup(null);
    localStorage.setup(null);
    events.setup(null);
    sessions.disconnected();
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

// function subscribeToSessions() {
//     var updateSessions = function (msg) {
//         if (!msg) {
//             return;
//         }
//         switch (msg.event) {
//             case "updated":
//                 sessions.update(msg.data);
//                 break;
//             case "deleted":
//                 sessions.delete(msg.data);
//                 break;
//             case "init":
//                 sessions.init(msg.data);
//         }
//     };
//     wampClient.subscribe("sessions", updateSessions, updateSessions, (e) => {
//         throw new Error("cannot subscribe to sessions", e);
//     });
// }

function subscribeToUsers() {
    const updateUsers = (msg) => {
        if (!msg) {
            return;
        }
        usersCache.update(msg);
    };
    wampClient.subscribe("users", updateUsers, updateUsers, (e) => {
        throw new Error("cannot subscribe to users", e);
    });
}

let configReceived = false;

function subscribeToConfig() {
    const updateConfig = (data) => {
        console.info("[subscribeToConfig] Config received");
        if (configReceived && process.env.NODE_ENV !== "DEV") {
            console.info("[subscribeToConfig] This is production mode. Will not load new config.");
            return;
        }

        console.info("[subscribeToConfig] Start update config and libs");
        configReceived = true;
        configStore.setup(data);
        loadLibs();
        setupModules();
        rawDb.createIndexes();
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

        const data = [];
        res.on("data", function (chunk) {
            data.push(chunk);
        });
        res.on("end", function () {
            const buf = Buffer.concat(data);
            userScript.require.registerZip(buf, (err) => {
                console.log("Libs loaded cb!");
                _libsReady = true;
                setupModules();
            });
            customFS._registerZip(buf);
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
    db.setup(mongoUri);
    if (serviceRegistry.getPBX()) {
        let firstPBX = serviceRegistry.getPBX();
        userScript.require.register("pbx", firstPBX.commonJS, firstPBX.address, firstPBX.port);
        console.info(`Module "pbx" registered. Address: "${firstPBX.address}"; port: "${firstPBX.port}"`);
    }
    if (configStore.isReady() && _libsReady) {
        if (!_started) {
            _started = true;
            runDidStartHandlers();
        }
        let firstTQ = serviceRegistry.getTaskQueueAddress();
        taskqClient.setup(firstTQ);
    } else {
        taskqClient.setup(null);
    }
    queue.srUpdate();
    console.log("Modules setup finished");
}

function runDidStartHandlers() {
    let config = configStore.getConfig();
    for (let storeName of Object.keys(config)) {
        let eventDesc = configStore.getStoreEventHandler(storeName, "didStart");
        if (eventDesc != null) {
            eventDesc();
        }
    }
}