"use strict";

const assert = require("assert");
const db = require("../lib/db");
const taskRunner = require("../lib/taskRunner");
const taskTypes = require("../lib/const").taskTypes;
const taskUris = require("../lib/const").taskUris;
const testConfig = require("./config");
const configStore = require("../lib/configStore");
const dbGet = require("../lib/taskHandlers/dbGet");
const WampMock = require("./wampMock");
const cloneDeep = require("lodash.clonedeep");

configStore.setup(testConfig);
console.debug = () => {};

let wampMock;
const sampleTask = {
    id: 0,
    store: "users",
    userId: "00000000-0000-0000-0000-000000000000",
    type: taskTypes.dbGet,
    args: {
        _id: "00000000-0000-0000-0000-000000000000",
    },
};

function getTask(options) {
    return Object.assign(cloneDeep(sampleTask), options);
}

describe("taskRunner", () => {
    describe("#validateTask", () => {
        it("should throw error when passing invalid task", () => {
            assert.throws(() => {
                taskRunner.test.validateTask();
            }, /Invalid task/);
            assert.throws(() => {
                taskRunner.test.validateTask({});
            }, /Invalid task/);
            assert.throws(() => {
                taskRunner.test.validateTask(getTask({ type: "UNKNOWN" }));
            }, /Task type 'UNKNOWN' is not supported/);
        });
        it("should insert guest userId when it empty", () => {
            let task = { id: 0, type: "dbGet", store: "users" };
            taskRunner.test.validateTask(task);
            assert.equal(task.userId, "guest");
        });
        it("should insert _ store when it empty", () => {
            let task = { id: 0, type: "dbGet", userId: "guest" };
            taskRunner.test.validateTask(task);
            assert.equal(task.store, "_");
        });
    });
    describe("#getUser", () => {
        it("should return user for 'root' user id", done => {
            taskRunner.test.getUser("root", (err, user) => {
                assert.deepEqual(user.roles, ["root"]);
                done();
            });
        });
        it("should return user for 'guest' user id", done => {
            taskRunner.test.getUser("guest", (err, user) => {
                assert.deepEqual(user.roles, ["guest"]);
                done();
            });
        });
    });
    describe("#runTask", () => {
        before(() => {
            dbGet.test.setDb({
                async get(id, store, options, cb) {
                    if (!cb) {
                        cb = options;
                    }

                    const res = { _id: id };
                    if (typeof cb === "function") {
                        setTimeout(() => {
                            cb(null, res);
                        });
                    }

                    return res;
                },
            });
        });
        after(() => {
            dbGet.test.setDb(db);
        });
        beforeEach(() => {
            wampMock = new WampMock();
            taskRunner.test.setWamp(wampMock);
        });
        it("shoud call error on invalid task", () => {
            taskRunner.test.runTask({});
            assert.equal(wampMock.getCallsCount(taskUris.error), 1);
        });
        it("should call error 'Store not found' when no store for task", async () => {
            await taskRunner.test.runTask(getTask({ store: "UNKNOWN" }));
            assert.equal(wampMock.getCallsCount(taskUris.error), 1);
            const c = wampMock.calls[taskUris.error][0];
            assert.equal(c.args[1], "Store not found");
        });
        it("should call error 'User not found' when no store for task", done => {
            let taskData = { id: Math.random(), userId: "UNKNOWN" };
            var h = function(t) {
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
        it("should call error 'Unauthorized' when no access to store", done => {
            const taskData = { id: Math.random(), store: "deniedStore1" };
            const h = t => {
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
        it("should fire 'taskWillRun' and 'taskDidRun' events and call 'done' for valid task", done => {
            let taskData = { id: Math.random() },
                willRunHandled = false;
            var willRun = function(t) {
                if (taskData.id === t.id) {
                    willRunHandled = true;
                }
            };
            var didRun = function(t) {
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
        it("should call error when error occured while running task", done => {
            let taskData = { id: Math.random(), args: null };
            var h = function(t) {
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
