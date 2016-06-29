"use strict";

var assert = require("assert");
var db = require("../lib/db");
var taskRunner = require("../lib/taskRunner");
var taskTypes = require("../lib/const").taskTypes;
var taskUris = require("../lib/const").taskUris;
var testConfig = require("./config");
var configStore = require("../lib/configStore");
var dbGet = require("../lib/taskHandlers/dbGet");
var WampMock = require("./wampMock");

configStore.setup(testConfig);
console.debug = console.log;

let wampMock,
    sampleTask = {
        "id": 0,
        "store": "users",
        "userId": "00000000-0000-0000-0000-000000000000",
        "type": taskTypes.dbGet,
        "args": {
            "_id": "00000000-0000-0000-0000-000000000000",
        },
    };

function getTask(options) {
    return Object.assign(JSON.parse(JSON.stringify(sampleTask)), options);
}

describe("taskRunner", function () {
    describe("#validateTask", function () {
        it("should throw error when passing invalid task", function () {
            assert.throws(function () {
                taskRunner.test.validateTask();
            }, /Invalid task/);
            assert.throws(function () {
                taskRunner.test.validateTask({});
            }, /Invalid task/);
            assert.throws(function () {
                taskRunner.test.validateTask(getTask({ "type": "UNKNOWN" }));
            }, /Task type 'UNKNOWN' not supported/);
        });
        it("should insert guest userId when it empty", function () {
            let task = { "id": 0, "type": "dbGet", "store": "users" };
            taskRunner.test.validateTask(task);
            assert.equal(task.userId, "guest");
        });
        it("should insert _ store when it empty", function () {
            let task = { "id": 0, "type": "dbGet", "userId": "guest" };
            taskRunner.test.validateTask(task);
            assert.equal(task.store, "_");
        });
    });
    describe("#getUser", function () {
        it("should return user for 'root' user id", function (done) {
            taskRunner.test.getUser("root", (e, user) => {
                assert.deepEqual(user.roles, ["root"]);
                done();
            });
        });
        it("should return user for 'guest' user id", function (done) {
            taskRunner.test.getUser("guest", (e, user) => {
                assert.deepEqual(user.roles, ["guest"]);
                done();
            });
        });
    });
    describe("#runTask", function () {
        before(function () {
            dbGet.test.setDb({
                "get": function (id, store, options, cb) {
                    if (typeof cb !== "function") {
                        cb = options;
                    }
                    setTimeout(function () {
                        cb(null, { "_id": id });
                    });
                },
            });
        });
        after(function () {
            dbGet.test.setDb(db);
        });
        beforeEach(function () {
            wampMock = new WampMock();
            taskRunner.test.setWamp(wampMock);
        });
        it("shoud call error on invalid task", function () {
            taskRunner.test.runTask({});
            assert.equal(wampMock.getCallsCount(taskUris.error), 1);
        });
        it("should call error 'Store not found' when no store for task", function () {
            taskRunner.test.runTask(getTask({ "store": "UNKNOWN" }));
            assert.equal(wampMock.getCallsCount(taskUris.error), 1);
            let c = wampMock.calls[taskUris.error][0];
            assert.equal(c.args[1], "Store not found");
        });
        it("should call error 'User not found' when no store for task", function (done) {
            let taskData = { "id": Math.random(), "userId": "UNKNOWN" };
            var h = function (t) {
                if (taskData.id === t.id) {
                    assert.equal(wampMock.getCallsCount(taskUris.error), 1);
                    let c = wampMock.calls[taskUris.error][0];
                    assert.equal(c.args[1], "User not found");
                    taskRunner.removeListener("taskUserNotFoundError", h);
                    done();
                }
            };
            taskRunner.on("taskUserNotFoundError", h);
            taskRunner.test.runTask(getTask(taskData));
        });
        it("should call error 'Unauthorized' when no access to store", function (done) {
            let taskData = { "id": Math.random(), "store": "deniedStore1" };
            var h = function (t) {
                if (taskData.id === t.id) {
                    assert.equal(wampMock.getCallsCount(taskUris.error), 1);
                    let c = wampMock.calls[taskUris.error][0];
                    assert.equal(c.args[1], "Unauthorized");
                    taskRunner.removeListener("taskAuthorizationError", h);
                    done();
                }
            };
            taskRunner.on("taskAuthorizationError", h);
            taskRunner.test.runTask(getTask(taskData));
        });
        it("should fire 'taskWillRun' and 'taskDidRun' events and call 'done' for valid task", function (done) {
            let taskData = { "id": Math.random() }, willRunHandled = false;
            var willRun = function (t) {
                if (taskData.id === t.id) {
                    willRunHandled = true;
                }
            };
            var didRun = function (t) {
                if (taskData.id === t.id) {
                    assert.equal(willRunHandled, true);
                    assert.equal(wampMock.getCallsCount(taskUris.done), 1);
                    taskRunner.removeListener("taskDidRun", didRun);
                    done();
                }
            };
            taskRunner.on("taskWillRun", willRun);
            taskRunner.on("taskDidRun", didRun);
            taskRunner.test.runTask(getTask(taskData));
        });
        it("should call error when error occured while running task", function (done) {
            let taskData = { "id": Math.random(), "args": null };
            var h = function (t) {
                if (taskData.id === t.id) {
                    assert.equal(wampMock.getCallsCount(taskUris.error), 1);
                    taskRunner.removeListener("taskDidRun", h);
                    done();
                }
            };
            taskRunner.on("taskDidRun", h);
            taskRunner.test.runTask(getTask(taskData));
        });
    });
});