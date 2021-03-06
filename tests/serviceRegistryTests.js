"use strict";

let assert = require("assert");
let serviceRegistry = require("../lib/serviceRegistry");

let sampleServices = {
    pbx: [{ address: "ws://127.0.0.1", port: "8081", commonJS: "hello!" }],
    taskQueue: [{ address: "ws://127.0.0.2", port: "8082" }],
    fileStore: [{ address: "http://127.0.0.3", port: "8083" }],
};

describe("Sessions", function() {
    it("should return taskQueue address from registry", function() {
        serviceRegistry.update(sampleServices);
        let tq = serviceRegistry.getTaskQueueAddress();
        assert.ok(tq != null);
        assert.equal(tq, "ws://127.0.0.2:8082");
    });
    it("should return fileStore URL object from registry", function() {
        serviceRegistry.update(sampleServices);
        let fs = serviceRegistry.getFileStoreURL();
        assert.ok(fs != null);
        assert.equal(fs, "http://127.0.0.3:8083/");
    });
    it("should return null when no requested service exists in registry", function() {
        serviceRegistry.update({});
        const tq = serviceRegistry.getTaskQueueAddress();
        assert.ok(tq === null);
        // const fs = serviceRegistry.getFileStoreURL();
        // assert.ok(fs === null);
    });
});
