"use strict";

var assert = require("assert");
var testConfig = require("./config");
var db = require("../lib/db");
// var taskTypes = require("../lib/const").taskTypes;
var configStore = require("../lib/configStore");
configStore.setup(testConfig);
var dbGet = require("../lib/taskHandlers/dbGet");
var dbSet = require("../lib/taskHandlers/dbSet");
var dbDelete = require("../lib/taskHandlers/dbDelete");
var action = require("../lib/taskHandlers/action");
var scheduledScript = require("../lib/taskHandlers/scheduledScript");
var authentication = require("../lib/taskHandlers/authentication");
var userConfig = require("../lib/taskHandlers/userConfig");
let dbMock = {
    "get": function (id, store, cb) {
        setTimeout(function () {
            cb(null, { "_id": id });
        });
    },
    "set": function (id, store, item, cb) {
        setTimeout(function () {
            cb(null, Object.assign({ "_id": id }, item));
        });
    },
    "delete": function (id, store, cb) {
        setTimeout(function () {
            cb(null, null);
        });
    },
};
let dbGetMock = {
    "get": function (id, store, cb) {
        setTimeout(function () {
            if (!id || id === "UNKNOWN") {
                cb(new Error(), null);
            }
            cb(null, { "_id": id, "disabled": true, "hidden": true, "test": 42 });
        });
    },
};
dbGet.test.setDb(dbMock);
dbSet.test.setDb(dbMock);
dbDelete.test.setDb(dbMock);


let storeName = "users",
    user = {
        "_id": "00000000-0000-0000-0000-000000000000",
        "roles": "00000000-0000-0000-0000-000000000000",
    };

describe("taskHandler/authentication", function () {
    before(function () {
        authentication.test.setDb({
            "get": function (query, store, cb) {
                setTimeout(function () {
                    if (query.login !== "1") {
                        return cb(new Error("UNKNOWN_ITEM"), null);
                    }
                    cb(null, {
                        "_id": "42",
                        "name": "Test user",
                        "hashedPassword": "MxRqmuKK+KK96rhbezMbqx87Dnn7RwNRJcU6outfanA=",
                        "salt": "1",
                    });
                });
            },
        });
    });
    after(function () {
        authentication.test.setDb(db);
    });
    it("should callback 'User not found' error if no user", function (done) {
        authentication.run(storeName, user, { "login": "UNKNOWN", "password": "UNKNOWN" }, function (e, d) {
            assert.equal(e.message, "User not found");
            done();
        });
    });
    it("should callback 'Password not match' error if password invalid", function (done) {
        authentication.run(storeName, user, { "login": "1", "password": "2" }, function (e, d) {
            assert.equal(e.message, "Password not match");
            done();
        });
    });
    it("should callback user if password valid", function (done) {
        authentication.run(storeName, user, { "login": "1", "password": "1" }, function (e, d) {
            assert.equal(d._id, "42");
            done();
        });
    });
});

describe("taskHandler/action", function () {
    beforeEach(function () {
        action.test.setDb(dbGetMock);
    });
    after(function () {
        action.test.setDb(db);
    });
    it("should callback error when no action description found", function (done) {
        action.run(storeName, user, { "actionId": "UNKNOWN" }, (e, d) => {
            assert.equal(e.message, "Action not found");
            done();
        });
    });
    it("should callback error when item load fails", function (done) {
        action.run(storeName, user, { "actionId": "return_item_test_property", "itemId": "UNKNOWN" }, (e, d) => {
            assert.equal(e.message, "Item load error");
            done();
        });
    });
    it("should callback error when not storeAction and no itemId provided", function (done) {
        action.run(storeName, user, { "actionId": "return_item_test_property" }, (e, d) => {
            assert.equal(e.message, "Invalid args: no itemId provided");
            done();
        });
    });
    it("should pass $item to hidden func and callback error if hidden", function (done) {
        action.run(storeName, user, { "actionId": "hidden_if_item_hidden", "itemId": "0" }, (e, d) => {
            assert.equal(e.message, "Action is hidden");
            done();
        });
    });
    it("should pass $item to disabled func and callback error if disabled", function (done) {
        action.run(storeName, user, { "actionId": "disabled_if_item_disabled", "itemId": "0" }, (e, d) => {
            assert.equal(e.message, "Action is disabled");
            done();
        });
    });
    it("should callback with result of script for valid action", function (done) {
        action.run(storeName, user, { "actionId": "return_item_test_property", "itemId": "0" }, (e, d) => {
            assert.equal(d, 42);
            done();
        });
    });
    it("should callback with result of script for valid storeAction", function (done) {
        action.run(storeName, user, { "actionId": "test_store_action" }, (e, d) => {
            assert.equal(d, "store_action_result");
            done();
        });
    });
    it("should be an $db object available in script", function (done) {
        action.run(storeName, user, { "actionId": "db_available_test", "itemId": "0" }, (e, d) => {
            assert.equal(e, null);
            assert.equal(d, "ok");
            done();
        });
    });
});

describe("taskHandler/scheduledScript", function () {
    it("should callback error when invalid taskIndex", function (done) {
        scheduledScript.run("storeWithTask", {"_id": "root"}, { "taskIndex": "ll" }, (e, d) => {
            assert.equal(e.message, "Invalid args.");
            done();
        });
    });
    it("should callback error when no scheduledScript description found", function (done) {
        scheduledScript.run("storeWithTask", {"_id": "root"}, { "taskIndex": 23 }, (e, d) => {
            assert.equal(e.message, "Task not found");
            done();
        });
    });
    it("should run task script with available $db object", function (done) {
        let consoleWarn = console.warn;
        console.warn = function (d) {
            assert.equal(d, "42");
            console.warn = consoleWarn;
            done();
        };
        scheduledScript.run("storeWithTask", {"_id": "root"}, { "taskIndex": 0 }, (e, d) => {
        });
    });
});

describe("taskHandlers/db", function () {
    describe("#dbGet", function () {
        it("should throw error when no id provided", function () {
            assert.throws(function () {
                dbGet.run(storeName, user, {}, (e, d) => { });
            }, /Invalid args/);
        });
        it("should return object when valid args", function (done) {
            dbGet.run(storeName, user, { "_id": "00000000-0000-0000-0000-000000000000" }, (e, d) => {
                assert.equal(d._id, "00000000-0000-0000-0000-000000000000");
                done();
            });
        });
    });
    describe("#dbSet", function () {
        it("should throw error when no id or item provided", function () {
            assert.throws(function () {
                dbSet.run(storeName, user, { "item": {} }, (e, d) => {
                    assert.equal(e.message.indexOf("Invalid args"), 0);
                });
            }, /Invalid args/);
            assert.throws(function () {
                dbSet.run(storeName, user, { "_id": "00000000-0000-0000-0000-000000000000" }, (e, d) => {
                    assert.equal(e.message.indexOf("Invalid args"), 0);
                });
            }, /Invalid args/);
        });
        it("should return object when valid args", function (done) {
            dbSet.run(storeName, user, { "_id": "00000000-0000-0000-0000-000000000000", "item": { "test": true } }, (e, d) => {
                assert.ok(d.test);
                done();
            });
        });
    });
    describe("#dbDelete", function () {
        it("should throw error when no id provided", function () {
            assert.throws(function () {
                dbDelete.run(storeName, user, {}, (e, d) => {
                    assert.equal(e.message.indexOf("Invalid args"), 0);
                });
            }, /Invalid args/);
        });
        it("should not return error when valid args", function (done) {
            dbDelete.run(storeName, user, { "_id": "00000000-0000-0000-0000-000000000000" }, (e, d) => {
                assert.equal(e, null);
                done();
            });
        });
    });
});

describe("taskHandler/userConfig", function () {
    afterEach(function () {
        configStore.setup(testConfig);
    });
    it("should callback 'Config not ready' error if no config", function (done) {
        configStore.setup(null);
        userConfig.run("_", user, {}, function (e, d) {
            assert.equal(e.message, "Config not ready");
            configStore.setup(testConfig);
            done();
        });
    });
    it("should callback config when configStore ready", function (done) {
        userConfig.run("_", user, {}, function (e, d) {
            assert.ok(d._commonSettings != null);
            done();
        });
    });
});