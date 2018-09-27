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

const pTimeout = t =>
    new Promise(resolve => {
        setTimeout(resolve, t);
    });

let dbMock = {
    async get(store, query, options = {}, cb) {
        cb = cb || options;
        const res = { _id: typeof query === "object" ? query._id : query };
        if (typeof cb == "function") {
            setTimeout(() => {
                cb(null, res);
            });

            return;
        }

        await pTimeout();
        return res;
    },
    async set(store, item, options = {}, cb) {
        cb = cb || options;
        const res = Object.assign({ _id: item.id }, item.item);
        if (typeof cb === "function") {
            setTimeout(() => {
                cb(null, res);
            });
        }

        return res;
    },
    delete(store, id, cb) {
        setTimeout(() => {
            cb && cb(null, null);
        });
    },
};

let dbGetMock = {
    async get(store, id, options, cb) {
        cb = cb || options;
        const res = { _id: id, disabled: true, hidden: true, test: 42 };
        if (typeof cb === "function") {
            setTimeout(() => {
                if (!id || id === "UNKNOWN") {
                    return cb(new Error(), null);
                }

                cb(null, res);
            });
        }

        if (!id || id === "UNKNOWN") {
            throw new Error();
        }

        return res;
    },
};

const storeName = "users";
const user = {
    _id: "00000000-0000-0000-0000-000000000000",
    roles: ["root"],
};

describe("taskHandler/authentication", () => {
    before(() => {
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
    after(() => {
        db.delete(storeName, "42", { drop: true });
    });
    it("should callback 'User not found' error if no user", () => {
        return authentication
            .run(storeName, user, { login: "UNKNOWN", password: "UNKNOWN" })
            .then(() => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.ok(err != null);
                assert.equal(err.message, "User not found");
            });
    });
    it("should callback 'Invalid password' error if password invalid", () => {
        return authentication
            .run(storeName, user, { login: "42", password: "43" })
            .then(() => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.ok(err != null);
                assert.equal(err.message, "Invalid password");
            });
    });
    it("should callback user if password valid", () => {
        return authentication.run(storeName, user, { login: "42", password: "42" }).then(res => {
            assert.equal(res._id, "42");
        });
    });
    it("should cleanup user hashedPassword, salt, activationToken and passwordResetToken", () => {
        return authentication.run(storeName, user, { login: "42", password: "42" }).then(res => {
            assert.ok(res.hashedPassword == null);
            assert.ok(res.salt == null);
            assert.ok(res.activationToken == null);
            assert.ok(res.passwordResetToken == null);
        });
    });
    it("should use custom findUser function if provided", () => {
        return authentication.run(storeName, user, { login: "242", password: "24" }).then(res => {
            assert.equal(res._id, "42");
        });
    });
    it("should use custom checkPassword function if provided", () => {
        return authentication.run(storeName, user, { login: "42", password: "24" }).then(res => {
            assert.equal(res._id, "42");
        });
    });
    it("should callback 'Invalid args. Must be login:string and (password:string or hashedPassword:string)' if no login or no password provided", () => {
        return authentication
            .run(storeName, user, { login: "42" })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(
                    err.message,
                    "Invalid args. Must be login:string and (password:string or hashedPassword:string)"
                );
                return authentication.run(storeName, user, { password: "42" });
            })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(
                    err.message,
                    "Invalid args. Must be login:string and (password:string or hashedPassword:string)"
                );
                return authentication.run(storeName, user, { hashedPassword: "42" });
            })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(
                    err.message,
                    "Invalid args. Must be login:string and (password:string or hashedPassword:string)"
                );
            });
    });
    it("should run willSignIn hook", () => {
        return authentication.run(storeName, user, { login: "42", password: "42" }).then(res => {
            assert.equal(res._id, "42");
            assert.equal(res.willSignInProp, "passed");
        });
    });
    it("should run willSignIn hook when custom checkPassword provided", () => {
        return authentication.run(storeName, user, { login: "42", password: "24" }).then(res => {
            assert.equal(res._id, "42");
            assert.equal(res.willSignInProp, "passed");
        });
    });
    it("should run reject auth when willSignIn hook rejected", () => {
        return authentication
            .run(storeName, user, { login: "42", password: "24", reject: true })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err.message, "rejected");
            });
    });
    it("should run reject auth when willSignIn hook rejected when custom checkPassword provided", () => {
        return authentication
            .run(storeName, user, { login: "42", password: "24", reject: true })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err.message, "rejected");
            });
    });
});

describe("taskHandler/signup", () => {
    before(() => {
        return db.insert("users", { email: "r@r.r", login: "root", password: "1" });
    });
    it("should callback 'user exists' error if user with the same login already exists", () => {
        return signup
            .run(storeName, user, { email: "root", password: "42" })
            .then(() => {
                throw new Error("should not resolve");
            })
            .catch(err => assert.equal(err.message, "user exists"));
    });
    it("should callback 'user exists' error if user with the same email already exists", () => {
        return signup
            .run(storeName, user, { email: "r@r.r", password: "42" })
            .then(() => {
                throw new Error("should not resolve");
            })
            .catch(err => assert.equal(err.message, "user exists"));
    });
    it("should callback with no error if this is a new user", () => {
        return signup.run(storeName, user, { email: "q@q.q", password: "q" }).then(res => {
            return db.get("users", { email: "q@q.q" }).then(user => {
                assert.equal(user.email, "q@q.q");
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
    it("should callback error when no action description found", () => {
        return action
            .run(storeName, user, { actionId: "UNKNOWN" })
            .then(() => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.equal(err.message, "Action not found");
            });
    });
    it("should callback error when item load fails", () => {
        return action
            .run(storeName, user, { actionId: "return_item_test_property", itemId: "UNKNOWN" })
            .then(res => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.equal(err.message, "Item load error");
            });
    });
    it("should callback error when not storeAction and no itemId provided", () => {
        return action
            .run(storeName, user, { actionId: "return_item_test_property" })
            .then(res => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.equal(err.message, "Invalid args: no itemId provided");
            });
    });
    it("should pass $item to hidden func and callback error if hidden", () => {
        return action
            .run(storeName, user, { actionId: "hidden_if_item_hidden", itemId: "0" })
            .then(res => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.equal(err.message, "Action is hidden");
            });
    });
    it("should pass $item to disabled func and callback error if disabled", () => {
        return action
            .run(storeName, user, { actionId: "disabled_if_item_disabled", itemId: "0" })
            .then(res => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.equal(err.message, "Action is disabled");
            });
    });
    it("should callback with result of script for valid action", () => {
        return action.run(storeName, user, { actionId: "return_item_test_property", itemId: "0" }).then(res => {
            assert.equal(res, 42);
        });
    });
    it("should callback with result of script for valid storeAction", () => {
        return action.run(storeName, user, { actionId: "test_store_action" }).then(res => {
            assert.equal(res, "store_action_result");
        });
    });
    it("should wait for resolve/reject if promise returned", () => {
        return action.run(storeName, user, { actionId: "promise_test", itemId: "0" }).then(res => {
            assert.equal(res, "42");
        });
    });
    it("should provide 'require' function and $db object in script", () => {
        return action.run(storeName, user, { actionId: "availability_test", itemId: "0" }).then(res => {
            assert.equal(res, "ok");
        });
    });
    it("should limit concurrent running actions when concurentCallsLimit === 1", () => {
        const now = Date.now();
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

        return action
            .run(storeName, user, { actionId: "concurrent_test", itemId: "0" })
            .then(() => {
                return action.run(storeName, user, { actionId: "concurrent_test", itemId: "0" });
            })
            .then(res => {
                assert.ok(Date.now() - now >= 1000);
            });
    });
});

describe("taskHandler/widgetData", () => {
    it("should return data from widget 'load' function", () => {
        return widgetData.run("storeWithWidget", user, { widgetId: "testWidget" }).then(res => {
            assert.equal(res, "WidgetData");
        });
    });
});

describe("taskHandler/scheduledScript", () => {
    it("should callback error when invalid taskIndex", () => {
        return scheduledScript
            .run("storeWithTask", { _id: "root" }, { taskIndex: "ll" })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err.message, "Invalid args.");
            });
    });
    it("should callback error when no scheduledScript description found", () => {
        return scheduledScript
            .run("storeWithTask", { _id: "root" }, { taskIndex: 23 })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err.message, "Task not found");
            });
    });
    it("should run task script with 'require' function and $db object", () => {
        const consoleWarn = console.warn;
        console.warn = d => {
            assert.equal(d, "42");
            console.warn = consoleWarn;
        };

        return scheduledScript.run("storeWithTask", { _id: "root" }, { taskIndex: 0 });
    });
});

describe("taskHandler/httpHook", () => {
    it("should callback error when invalid hookIndex", () => {
        return httpHook
            .run("storeWithHttpHook", { _id: "root" }, { hookIndex: "6" })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err.message, "Invalid args");
            });
    });
    it("should callback error when no httpHook description found", () => {
        return httpHook
            .run("storeWithHttpHook", { _id: "root" }, { hookIndex: 23 })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err.message, "Http Hook not found");
            });
    });
    it("should run httpHook script that resolve promise", () => {
        return httpHook.run("storeWithHttpHook", { _id: "root" }, { hookIndex: 0 }).then(res => {
            assert.equal(res, "42");
        });
    });
    it("should run httpHook script that promise rejected", () => {
        return httpHook
            .run("storeWithHttpHook", { _id: "root" }, { hookIndex: 1 })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err, "42");
            });
    });
    it("should run httpHook script that use uri param", () => {
        return httpHook
            .run("storeWithHttpHook", { _id: "root" }, { hookIndex: 2, request: { params: { id: 24 } } })
            .then(res => {
                assert.equal(res, 24);
            });
    });
});

describe("taskHandler/storeLifeCycle", () => {
    it("should callback error when user is not 'system'", () => {
        return storeLifeCycle
            .run("storeWithLifeCycle", { _id: "root" }, {})
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err.message, "Access denied");
            });
    });
    it("should callback error when invalid args", () => {
        return storeLifeCycle
            .run("storeWithLifeCycle", { _id: "system" }, {})
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err.message, "Invalid args");
            });
    });
    it("should callback error when no event description found", () => {
        return storeLifeCycle
            .run("storeWithLifeCycle", { _id: "system" }, { event: "UNKNOWN" })
            .then(() => {
                throw new Error("should not be resolved");
            })
            .catch(err => {
                assert.equal(err.message, "Handler not found");
            });
    });
    it("should run event handler script with 'require' function and $db object", () => {
        const consoleWarn = console.warn;
        console.warn = d => {
            assert.equal(d, "42");
            console.warn = consoleWarn;
        };

        return storeLifeCycle.run("storeWithLifeCycle", { _id: "system" }, { event: "didStart" });
    });
});

describe("taskHandlers/db", () => {
    beforeEach(() => {
        dbGet.test.setDb(dbMock);
        dbSet.test.setDb(dbMock);
        dbDelete.test.setDb(dbMock);
    });
    after(() => {
        dbGet.test.setDb(db);
        dbSet.test.setDb(db);
        dbDelete.test.setDb(db);
    });
    describe("#dbGet", () => {
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
        it("should return baseItem when store.display is 'single'", () => {
            dbGet.test.setDb(db);
            return dbGet.run("displaySingleStore", user, { _id: "displaySingleStore" }).then(res => {
                assert.equal(res.testProp, "42");
            });
        });
        it("should return proper '_id' when store.display is 'single'", () => {
            return dbGet.run("displaySingleStore", user, { _id: "displaySingleStore" }).then(res => {
                assert.equal(res._id, "displaySingleStore");
            });
        });
        it("should return object when valid args", () => {
            return dbGet.run(storeName, user, { _id: "00000000-0000-0000-0000-000000000000" }).then(res => {
                assert.equal(res._id, "00000000-0000-0000-0000-000000000000");
            });
        });
    });
    describe("#dbSet", () => {
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
        it("should return object when valid args", () => {
            return dbSet
                .run(storeName, user, { item: { _id: "00000000-0000-0000-0000-000000000000", item: { test: true } } })
                .then(res => {
                    assert.ok(res.test);
                });
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
                async get(store, query) {
                    throw new Error(dbErrors.itemNotFound);
                },
                async set(store, item, options = {}, cb = () => {}) {
                    assert.equal(item._id, "42");
                    done();
                },
            });

            dbSet.run("displaySingleStore", user, { item: { _id: "displaySingleStore", test: true } });
        });
    });
    describe("#dbDelete", () => {
        it("should throw error when no id provided", () => {
            return dbDelete
                .run(storeName, user, {})
                .then(() => {
                    throw new Error("should not be resolved");
                })
                .catch(err => {
                    assert.ok(/Invalid args/.exec(err.message));
                });
        });
        it("should not return error when valid args", () => {
            return dbDelete.run(storeName, user, { _id: "00000000-0000-0000-0000-000000000000" });
        });
    });
});

describe("taskHandler/userConfig", () => {
    afterEach(() => {
        configStore.setup(testConfig);
    });
    it("should callback 'Config not ready' error if no config", () => {
        configStore.setup(null);
        return userConfig
            .run("_", user, {})
            .then(() => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.equal(err.message, "Config not ready");
                configStore.setup(testConfig);
            });
    });
    it("should callback config when configStore ready", () => {
        return userConfig.run("_", user, {}).then(res => {
            assert.ok(res._commonSettings != null);
        });
    });
});

// TODO: add DbLoadRefs tests
