"use strict";

var assert = require("assert");
var testConfig = require("./config");
var db = require("../lib/db");
// var taskTypes = require("../lib/const").taskTypes;
var configStore = require("../lib/configStore");
var dbGet = require("../lib/taskHandlers/dbGet");
var dbSet = require("../lib/taskHandlers/dbSet");
var dbDelete = require("../lib/taskHandlers/dbDelete");
var action = require("../lib/taskHandlers/action");
var widgetData = require("../lib/taskHandlers/widgetData");
var scheduledScript = require("../lib/taskHandlers/scheduledScript");
var httpHook = require("../lib/taskHandlers/httpHook");
var storeLifeCycle = require("../lib/taskHandlers/storeLifeCycle");
var authentication = require("../lib/taskHandlers/authentication");
var signup = require("../lib/taskHandlers/signup");
var userConfig = require("../lib/taskHandlers/userConfig");
var dbErrors = require("../lib/const").dbErrors;

let userScript = require("../lib/userScript");
var localStorage = require("../lib/localStorage");
let sync = require("../lib/sync");
var syncMock = require("./syncMock");
userScript.setup({
    mutex: sync,
    sync: sync,
    localStorage: localStorage,
    $db: db,
});

configStore.setup(testConfig);

let dbMock = {
    get: function(store, query, options = {}, cb) {
        cb = cb || options;
        setTimeout(function() {
            cb(null, { _id: typeof query === "object" ? query._id : query });
        });
    },
    set: function(store, item, options = {}, cb) {
        cb = cb || options;
        setTimeout(function() {
            cb(null, Object.assign({ _id: item.id }, item.item));
        });
    },
    delete: function(store, id, cb) {
        setTimeout(function() {
            cb && cb(null, null);
        });
    },
};
let dbGetMock = {
    get: function(store, id, options, cb) {
        cb = cb || options;
        setTimeout(function() {
            if (!id || id === "UNKNOWN") {
                return cb(new Error(), null);
            }
            cb(null, { _id: id, disabled: true, hidden: true, test: 42 });
        });
    },
};

const storeName = "users";
const user = {
    _id: "00000000-0000-0000-0000-000000000000",
    roles: ["root"],
};

describe("taskHandler/authentication", function() {
    before(function() {
        const crypto = require("crypto");
        const password = crypto
            .createHash("md5")
            .update("42")
            .digest("hex");
        return db.set(storeName, {
            _id: "42",
            login: "42",
            customLogin: "242",
            isActive: true,
            customPassword: "24",
            password,
        });
    });
    after(function() {
        db.delete(storeName, "42", { drop: true });
    });
    it("should callback 'User not found' error if no user", done => {
        authentication.run(storeName, user, { login: "UNKNOWN", password: "UNKNOWN" }, (err, res) => {
            assert.ok(err != null);
            assert.equal(err.message, "User not found");
            done();
        });
    });
    it("should callback 'Invalid password' error if password invalid", done => {
        authentication.run(storeName, user, { login: "42", password: "43" }, (err, res) => {
            assert.ok(err != null);
            assert.equal(err.message, "Invalid password");
            done();
        });
    });
    it("should callback user if password valid", done => {
        authentication.run(storeName, user, { login: "42", password: "42" }, (err, res) => {
            assert.equal(res._id, "42");
            done();
        });
    });
    it("should cleanup user hashedPassword, salt, activationToken and passwordResetToken", done => {
        authentication.run(storeName, user, { login: "42", password: "42" }, (err, res) => {
            assert.ok(err == null);
            assert.ok(res.hashedPassword == null);
            assert.ok(res.salt == null);
            assert.ok(res.activationToken == null);
            assert.ok(res.passwordResetToken == null);
            done();
        });
    });
    it("should use custom findUser function if provided", done => {
        authentication.run(storeName, user, { login: "242", password: "24" }, (err, res) => {
            assert.ok(err == null);
            assert.equal(res._id, "42");
            done();
        });
    });
    it("should use custom checkPassword function if provided", done => {
        authentication.run(storeName, user, { login: "42", password: "24" }, (err, res) => {
            assert.ok(err == null);
            assert.equal(res._id, "42");
            done();
        });
    });
    it("should callback 'Invalid args. Must be login:string and (password:string or hashedPassword:string)' if no login or no password provided", done => {
        authentication.run(storeName, user, { login: "42" }, function(err) {
            assert.equal(
                err.message,
                "Invalid args. Must be login:string and (password:string or hashedPassword:string)"
            );
            authentication.run(storeName, user, { password: "42" }, function(err) {
                assert.equal(
                    err.message,
                    "Invalid args. Must be login:string and (password:string or hashedPassword:string)"
                );
                authentication.run(storeName, user, { hashedPassword: "42" }, function(err) {
                    assert.equal(
                        err.message,
                        "Invalid args. Must be login:string and (password:string or hashedPassword:string)"
                    );
                    done();
                });
            });
        });
    });
    it("should run willSignIn hook", done => {
        authentication.run(storeName, user, { login: "42", password: "42" }, (err, res) => {
            assert.ok(err == null);
            assert.equal(res._id, "42");
            assert.equal(res.willSignInProp, "passed");
            done();
        });
    });
    it("should run willSignIn hook when custom checkPassword provided", done => {
        authentication.run(storeName, user, { login: "42", password: "24" }, (err, res) => {
            assert.ok(err == null);
            assert.equal(res._id, "42");
            assert.equal(res.willSignInProp, "passed");
            done();
        });
    });
    it("should run reject auth when willSignIn hook rejected", done => {
        authentication.run(storeName, user, { login: "42", password: "24", reject: true }, (err, res) => {
            assert.ok(err != null);
            assert.equal(err.message, "rejected");
            done();
        });
    });
    it("should run reject auth when willSignIn hook rejected when custom checkPassword provided", done => {
        authentication.run(storeName, user, { login: "42", password: "24", reject: true }, (err, res) => {
            assert.ok(err != null);
            assert.equal(err.message, "rejected");
            done();
        });
    });
});

describe("taskHandler/signup", () => {
    before(() => {
        return db.insert("users", { email: "r@r.r", login: "root", password: "1" });
    });
    it("should callback 'user exists' error if user with the same login already exists", done => {
        signup.run(storeName, user, { email: "root", password: "42" }, (err, res) => {
            assert.equal(err.message, "user exists");
            done();
        });
    });
    it("should callback 'user exists' error if user with the same email already exists", done => {
        signup.run(storeName, user, { email: "r@r.r", password: "42" }, (err, res) => {
            assert.equal(err.message, "user exists");
            done();
        });
    });
    it("should callback with no error if this is a new user", done => {
        signup.run(storeName, user, { email: "q@q.q", password: "q" }, (err, res) => {
            assert.equal(err, null);
            db.get("users", { email: "q@q.q" }, (err, user) => {
                assert.equal(err, null);
                assert.equal(user.email, "q@q.q");
                done();
            });
        });
    });
});

describe("taskHandler/action", () => {
    beforeEach(() => {
        action.test.setDb(dbGetMock);
    });
    after(() => {
        action.test.setDb(db);
    });
    it("should callback error when no action description found", done => {
        action.run(storeName, user, { actionId: "UNKNOWN" }, (e, d) => {
            assert.equal(e.message, "Action not found");
            done();
        });
    });
    it("should callback error when item load fails", done => {
        action.run(storeName, user, { actionId: "return_item_test_property", itemId: "UNKNOWN" }, (e, d) => {
            assert.equal(e.message, "Item load error");
            done();
        });
    });
    it("should callback error when not storeAction and no itemId provided", done => {
        action.run(storeName, user, { actionId: "return_item_test_property" }, (e, d) => {
            assert.equal(e.message, "Invalid args: no itemId provided");
            done();
        });
    });
    it("should pass $item to hidden func and callback error if hidden", done => {
        action.run(storeName, user, { actionId: "hidden_if_item_hidden", itemId: "0" }, (e, d) => {
            assert.equal(e.message, "Action is hidden");
            done();
        });
    });
    it("should pass $item to disabled func and callback error if disabled", done => {
        action.run(storeName, user, { actionId: "disabled_if_item_disabled", itemId: "0" }, (e, d) => {
            assert.equal(e.message, "Action is disabled");
            done();
        });
    });
    it("should callback with result of script for valid action", done => {
        action.run(storeName, user, { actionId: "return_item_test_property", itemId: "0" }, (e, d) => {
            assert.equal(d, 42);
            done();
        });
    });
    it("should callback with result of script for valid storeAction", done => {
        action.run(storeName, user, { actionId: "test_store_action" }, (e, d) => {
            assert.equal(d, "store_action_result");
            done();
        });
    });
    it("should wait for resolve/reject if promise returned", done => {
        action.run(storeName, user, { actionId: "promise_test", itemId: "0" }, (e, d) => {
            assert.equal(e, null);
            assert.equal(d, "42");
            done();
        });
    });
    it("should provide 'require' function and $db object in script", done => {
        action.run(storeName, user, { actionId: "availability_test", itemId: "0" }, (e, d) => {
            assert.equal(e, null);
            assert.equal(d, "ok");
            done();
        });
    });
    it("should limit concurrent running actions when concurentCallsLimit === 1", done => {
        let now = Date.now();
        sync.setup({
            call: (m, cb, id) => {
                switch (m) {
                    case "sync.lock":
                        syncMock.lock(id, cb);
                        break;
                    case "sync.unlock":
                        syncMock.unlock(id, cb);
                        break;
                }
            },
        });
        action.run(storeName, user, { actionId: "concurrent_test", itemId: "0" }, (e, d) => {
            assert.equal(e, null);
        });
        action.run(storeName, user, { actionId: "concurrent_test", itemId: "0" }, (e, d) => {
            assert.equal(e, null);
            assert.ok(Date.now() - now >= 1000);
            done();
        });
    });
});

describe("taskHandler/widgetData", function() {
    it("should return data from widget 'load' function", done => {
        widgetData.run("storeWithWidget", user, { widgetId: "testWidget" }, (e, d) => {
            assert.equal(d, "WidgetData");
            done();
        });
    });
});

describe("taskHandler/scheduledScript", function() {
    it("should callback error when invalid taskIndex", done => {
        scheduledScript.run("storeWithTask", { _id: "root" }, { taskIndex: "ll" }, (e, d) => {
            assert.equal(e.message, "Invalid args.");
            done();
        });
    });
    it("should callback error when no scheduledScript description found", done => {
        scheduledScript.run("storeWithTask", { _id: "root" }, { taskIndex: 23 }, (e, d) => {
            assert.equal(e.message, "Task not found");
            done();
        });
    });
    it("should run task script with 'require' function and $db object", done => {
        let consoleWarn = console.warn;
        console.warn = function(d) {
            assert.equal(d, "42");
            console.warn = consoleWarn;
            done();
        };
        scheduledScript.run("storeWithTask", { _id: "root" }, { taskIndex: 0 }, (e, d) => {});
    });
});

describe("taskHandler/httpHook", function() {
    it("should callback error when invalid hookIndex", done => {
        httpHook.run("storeWithHttpHook", { _id: "root" }, { hookIndex: "6" }, (e, d) => {
            assert.equal(e.message, "Invalid args.");
            done();
        });
    });
    it("should callback error when no httpHook description found", done => {
        httpHook.run("storeWithHttpHook", { _id: "root" }, { hookIndex: 23 }, (e, d) => {
            assert.equal(e.message, "Http Hook not found");
            done();
        });
    });
    it("should run httpHook script that resolve promise", done => {
        httpHook.run("storeWithHttpHook", { _id: "root" }, { hookIndex: 0 }, (e, d) => {
            assert.equal(e, null);
            assert.equal(d, "42");
            done();
        });
    });
    it("should run httpHook script that promise rejected", done => {
        httpHook.run("storeWithHttpHook", { _id: "root" }, { hookIndex: 1 }, (e, d) => {
            assert.notEqual(e, null);
            assert.equal(e, "42");
            done();
        });
    });
    it("should run httpHook script that use uri param", done => {
        httpHook.run(
            "storeWithHttpHook",
            { _id: "root" },
            { hookIndex: 2, request: { params: { id: 24 } } },
            (e, d) => {
                assert.equal(e, null);
                assert.equal(d, 24);
                done();
            }
        );
    });
});

describe("taskHandler/storeLifeCycle", function() {
    it("should callback error when user is not 'system'", done => {
        storeLifeCycle.run("storeWithLifeCycle", { _id: "root" }, {}, (e, d) => {
            assert.equal(e.message, "Access denied");
            done();
        });
    });
    it("should callback error when invalid args", done => {
        storeLifeCycle.run("storeWithLifeCycle", { _id: "system" }, {}, (e, d) => {
            assert.equal(e.message, "Invalid args");
            done();
        });
    });
    it("should callback error when no event description found", done => {
        storeLifeCycle.run("storeWithLifeCycle", { _id: "system" }, { event: "UNKNOWN" }, (e, d) => {
            assert.equal(e.message, "Handler not found");
            done();
        });
    });
    it("should run event handler script with 'require' function and $db object", done => {
        let consoleWarn = console.warn;
        console.warn = function(d) {
            assert.equal(d, "42");
            console.warn = consoleWarn;
            done();
        };
        storeLifeCycle.run("storeWithLifeCycle", { _id: "system" }, { event: "didStart" }, (e, d) => {});
    });
});

describe("taskHandlers/db", function() {
    beforeEach(function() {
        dbGet.test.setDb(dbMock);
        dbSet.test.setDb(dbMock);
        dbDelete.test.setDb(dbMock);
    });
    after(function() {
        dbGet.test.setDb(db);
        dbSet.test.setDb(db);
        dbDelete.test.setDb(db);
    });
    describe("#dbGet", function() {
        it("should throw error when no id provided", async () => {
            try {
                await dbGet.run(storeName, user, {}, (e, d) => {});
                throw new Error("should not resolve");
            } catch (err) {
                assert.ok(/Invalid args/.exec(err.message));
            }
        });
        it("should modify query when store.display is 'single'", done => {
            dbGet.test.setDb({
                get: function(store, query) {
                    assert.deepEqual(query, {
                        _ownerId: user._id,
                    });
                    done();
                },
            });

            dbGet.run("displaySingleStore", user, { _id: "displaySingleStore" });
        });
        it("should return baseItem when store.display is 'single'", done => {
            dbGet.test.setDb(db);
            dbGet.run("displaySingleStore", user, { _id: "displaySingleStore" }, (e, d) => {
                assert.ok(e == null);
                assert.equal(d.testProp, "42");
                done();
            });
        });
        it("should return proper '_id' when store.display is 'single'", done => {
            dbGet.run("displaySingleStore", user, { _id: "displaySingleStore" }, (e, d) => {
                assert.equal(d._id, "displaySingleStore");
                done();
            });
        });
        it("should return object when valid args", done => {
            dbGet.run(storeName, user, { _id: "00000000-0000-0000-0000-000000000000" }, (e, d) => {
                assert.equal(d._id, "00000000-0000-0000-0000-000000000000");
                done();
            });
        });
    });
    describe("#dbSet", function() {
        it("should throw error when no id or item provided", async () => {
            try {
                await dbSet.run(storeName, user, { item: {} });
                throw new Error("should not resolve");
            } catch (err) {
                assert.ok(/Invalid args/.exec(err.message));
            }

            try {
                await dbSet.run(storeName, user, { _id: "00000000-0000-0000-0000-000000000000" });
                throw new Error("should not resolve");
            } catch (err) {
                assert.ok(/Invalid args/.exec(err.message));
            }
        });
        it("should return object when valid args", done => {
            dbSet.run(
                storeName,
                user,
                { item: { _id: "00000000-0000-0000-0000-000000000000", item: { test: true } } },
                (err, res) => {
                    assert.ok(res.test);
                    done();
                }
            );
        });
        it("should find and replace '_id' when store.display is 'single'", () => {
            dbSet.test.setDb({
                get(store, query) {
                    assert.deepEqual(query, { _ownerId: user._id });
                    return Promise.resolve({ _id: "1234" });
                },
                set: (store, item, opt) => {
                    assert.equal(item._id, "1234");
                },
            });

            return dbSet.run("displaySingleStore", user, { item: { _id: "displaySingleStore", test: true } }, () => {});
        });
        it("should create new '_id' when store.display is 'single'", done => {
            dbSet.test.setDb({
                newId: async () => "42",
                get: function(store, query, cb) {
                    throw new Error(dbErrors.itemNotFound);
                },
                set: function(store, item, options = {}, cb = () => {}) {
                    assert.equal(item._id, "42");
                    done();
                },
            });

            dbSet.run("displaySingleStore", user, { item: { _id: "displaySingleStore", test: true } });
        });
    });
    describe("#dbDelete", function() {
        it("should throw error when no id provided", function() {
            assert.throws(function() {
                dbDelete.run(storeName, user, {}, (e, d) => {
                    assert.equal(e.message.indexOf("Invalid args"), 0);
                });
            }, /Invalid args/);
        });
        it("should not return error when valid args", done => {
            dbDelete.run(storeName, user, { _id: "00000000-0000-0000-0000-000000000000" }, (e, d) => {
                assert.equal(e, null);
                done();
            });
        });
    });
});

describe("taskHandler/userConfig", () => {
    afterEach(() => {
        configStore.setup(testConfig);
    });
    it("should callback 'Config not ready' error if no config", done => {
        configStore.setup(null);
        userConfig.run("_", user, {}, (err, res) => {
            assert.equal(err.message, "Config not ready");
            configStore.setup(testConfig);
            done();
        });
    });
    it("should callback config when configStore ready", done => {
        userConfig.run("_", user, {}, (err, res) => {
            assert.ok(res._commonSettings != null);
            done();
        });
    });
});

// TODO: add DbLoadRefs tests
