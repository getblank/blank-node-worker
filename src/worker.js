"use strict";
process.title = "blank-node-worker";
import http from "http";
import minimist from "minimist";
import JSZip from "jszip";
import WampClient from "wamp";
import "./taskRunner";
import taskqClient from "./taskqClient";
import configStore from "./configStore";
import db from "./db";
import consoleHandler from "./consoleHandler";
import sessions from "./sessions";
import "./db/events";
import userScript from "./userScript";
import serviceRegistry from "./serviceRegistry";
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
        // don't set the encoding, it will break everything !
        // or, if you must, set it to null. In that case the chunk will be a string.
        res.on("data", function (chunk) {
            data.push(chunk);
            dataLen += chunk.length;
        });
        res.on("end", function () {
            var buf = Buffer.concat(data);
            JSZip.loadAsync(buf).then(function (zip) {
                let res = {}, defers = [];
                zip.forEach(function (relativePath, file) {
                    if (!file.dir) {
                        let defer = file.async("string");
                        defer.then((content) => {
                            console.log("Extracted: ", relativePath, " Code:", res[relativePath].slice(0, 10).replace(/(\r?\n)/g), "...");
                            userScript.require.register(relativePath, content);
                        });
                        defers.push(defer);
                    }
                });
                Promise.all(defers).then(() => {
                    console.log(`Libs loaded: ${defers.length}`);
                    _libsReady = true;
                    setupModules();
                });
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
    db.setup("mongodb://localhost:27017/blank");
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