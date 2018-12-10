"use strict";

process.title = process.env.WORKER_NAME || "blank-node-worker";

process.on("uncaughtException", err => {
    console.error(`\n${new Date()} Caught exception: ${err.message}\n${err.stack}\n`);
    process.exit(1);
});

const http = require("http");
const minimist = require("minimist");
const WampClient = require("wamp");
const taskqClient = require("./taskqClient");
const configStore = require("./configStore");
const db = require("./db");
const mongoDB = require("./db/mongoDB");
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

const externalSync = process.env.BLANK_MULTIPLE_WORKERS === "true";

global.WebSocket = require("ws");
const dbName = process.env.MONGO_PORT_27017_DB_NAME || "blank";
const dbAddr = process.env.MONGO_PORT_27017_TCP_ADDR || "localhost";
const dbPort = process.env.MONGO_PORT_27017_TCP_PORT || "27017";
const mongoUri = `mongodb://${dbAddr}:${dbPort}/${dbName}`;
const wampClient = new WampClient(true, true);
let _libsReady = false;
let _started = false;

wampClient.onopen = function() {
    console.info("Connection to " + srUri + " established");
    wampClient.call(
        "register",
        (data, err) => {
            err && console.log("Error while registering on SR:", err);
        },
        { type: "worker" }
    );
    subscribeToSR();
    subscribeToConfig();
    sessions.connected(wampClient);
    subscribeToUsers();
    localStorage.setup(wampClient);
    events.setup(wampClient);
    if (externalSync) {
        sync.setup(wampClient);
    }
};

wampClient.onclose = function() {
    console.info("Connection closed.");
    localStorage.setup(null);
    events.setup(null);
    sessions.disconnected();
    if (externalSync) {
        sync.setup(null);
    }
};

const argv = minimist(process.argv.slice(2));
let srUri = argv.sr || argv._[0] || process.env.BLANK_SERVICE_REGISTRY || "ws://localhost:1234";
if (process.env.BLANK_SERVICE_REGISTRY_PORT) {
    srUri = `ws://localhost:${process.env.BLANK_SERVICE_REGISTRY_PORT}`;
}

if (!srUri) {
    throw new Error("Service registry address not provided!");
}

console.info(`Connecting to ${srUri}`);
wampClient.open(srUri);

function subscribeToSR() {
    const updateRegistry = function(data) {
        console.log("SR update:", data);
        serviceRegistry.update(data);
        setupModules();
    };

    wampClient.subscribe("registry", updateRegistry, updateRegistry, e => {
        throw new Error("cannot subscribe to service registry", e);
    });
}

function subscribeToUsers() {
    const updateUsers = msg => {
        if (!msg) {
            return;
        }
        usersCache.update(msg);
    };
    wampClient.subscribe("users", updateUsers, updateUsers, e => {
        throw new Error("cannot subscribe to users", e);
    });
}

let configReceived = false;

function subscribeToConfig() {
    const updateConfig = async data => {
        console.info("[subscribeToConfig] Config received");
        if (configReceived && process.env.NODE_ENV !== "DEV") {
            console.info("[subscribeToConfig] This is production mode. Will not load new config.");
            return;
        }

        console.info("[subscribeToConfig] Start update config and libs");
        configReceived = true;
        const dataSources = await configStore.setup(data);
        loadLibs(dataSources);
        // setupModules(dataSources);
        mongoDB.createIndexes();
    };
    wampClient.subscribe("config", updateConfig, updateConfig, e => {
        throw new Error("cannot subscribe to config", e);
    });
}

function loadLibs(dataSources) {
    _libsReady = false;
    let uri = srUri.replace("ws://", "http://");
    uri += (uri[uri.length - 1] === "/" ? "" : "/") + "lib/";
    console.log("Loading libs from:", uri);
    http.get(uri, res => {
        if (res.statusCode !== 200) {
            console.log("Libs load error:", res.statusCode);
            setupModules(dataSources);
            return;
        }

        const data = [];
        res.on("data", function(chunk) {
            data.push(chunk);
        });
        res.on("end", function() {
            const buf = Buffer.concat(data);
            userScript.require.registerZip(buf, err => {
                console.log("Libs loaded cb!");
                _libsReady = true;
                setupModules(dataSources);
            });
            customFS._registerZip(buf);
        });
    }).on("error", e => {
        console.log(`Libs load error: ${e.message}`);
        _libsReady = false;
        setupModules(dataSources);
        return;
    });
}

function setupModules(dataSources) {
    console.log("Modules setup started");
    if (dataSources && dataSources.has("mongo")) {
        db.setupMongo(mongoUri);
    }

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

        const firstTQ = serviceRegistry.getTaskQueueAddress();
        taskqClient.setup(firstTQ);
    } else {
        taskqClient.setup(null);
    }
    queue.srUpdate();
    console.log("Modules setup finished");
}

async function runDidStartHandlers() {
    const config = await configStore.getConfig();
    for (const storeName of Object.keys(config)) {
        const eventDesc = configStore.getStoreEventHandler(storeName, "didStart");
        if (eventDesc != null) {
            eventDesc();
        }
    }
}
