"use strict";

const assert = require("assert");
const testConfig = require("./config");
const configStore = require("../lib/configStore");
configStore.setup(testConfig);
const db = require("../lib/db/mongoDB");
const $db = require("../lib/db/index");
const sync = require("../lib/sync");
const syncMock = require("./syncMock");
require("../lib/promiseSeries");
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

describe("$db", function() {
    before(function(done) {
        $db.setup("mongodb://127.0.0.1:27017/blankTest");
        db.on("connected", () => {
            db._dropCollection("users")
                .then(() => {
                    return db._dropCollection("users_deleted");
                })
                .then(() => {
                    return db._dropCollection("forEachTestStore");
                })
                .then(() => {
                    return db._dropCollection("partialTestsNotificationStore");
                })
                .then(() => {
                    return db._dropCollection("storeWithCustomStringId");
                })
                .then(() => {
                    return db._dropCollection("storeWithCustomIntId");
                })
                .then(() => {
                    return db._insertMany("users", [
                        {
                            _id: "AAAAAAAA-0000-0000-0000-000000000000",
                            _ownerId: "00000000-0000-0000-0000-000000000000",
                            testProp: "40",
                            name: "testName",
                            login: "22",
                        },
                        {
                            _id: "AAAAAAAA-0000-0000-0000-000000000001",
                            _ownerId: "00000000-0000-0000-0000-000000000000",
                            testProp: "41",
                            name: "testName",
                            login: "33",
                        },
                        {
                            _id: "AAAAAAAA-0000-0000-0000-000000000002",
                            _ownerId: "00000000-0000-0000-0000-000000000000",
                            testProp: "42",
                            name: "testName",
                            login: "11",
                        },
                        { _id: "AAAAAAAA-0000-0000-0000-000000000003", testProp: "43", name: "name", login: "11" },
                        { _id: "AAAAAAAA-0000-0000-0000-000000000004", testProp: "44" },
                        { _id: "AAAAAAAA-0000-0000-0000-000000000042", testProp: "toDelete" },
                        { _id: "AAAAAAAA-0000-0000-0000-000000000043", testProp: "toDelete2" },
                        { _id: "AAAAAAAA-0000-0000-0000-000000000044", testProp: "toDelete3" },
                        { _id: "AAAAAAAA-0000-0000-0000-000000000046", testProp: "toDelete4" },
                        {
                            _id: "AAAAAAAA-0000-0000-0000-000000000045",
                            testProp: "toLoadVirtual",
                            objectOfVirtuals: {
                                nestedProp: "NESTED_PROP",
                            },
                            objectListOfVirtuals: [
                                { nestedProp: "NESTED_LIST_PROP1" },
                                { nestedProp: "NESTED_LIST_PROP2" },
                            ],
                        },
                    ]);
                })
                .then(() => $db.set("storeWithVirtualProps", { _id: "1" }))
                .then(() => done());
        });
    });
    describe("#_copyReadableItemProps", function() {
        it("should return only items user has access to", function() {
            let source = {
                allowedProp1: "value1",
                allowedProp2: "value2",
                disallowedProp: "value3",
                allowedObjectProp: {
                    allowedSubProp: "value4",
                    disallowedSubProp: "value5",
                },
                allowedObjectListProp: [
                    {
                        allowedSubProp: "value6",
                        disallowedSubProp: "value7",
                    },
                    {
                        allowedSubProp: "value8",
                        disallowedSubProp: "value9",
                    },
                ],
            };
            let allowedProps = {
                allowedProp1: true,
                allowedProp2: true,
                allowedObjectProp: {
                    allowedSubProp: true,
                },
                allowedObjectListProp: {
                    allowedSubProp: true,
                },
            };
            let result = $db._copyReadableItemProps(allowedProps, source);
            assert.equal(result.allowedProp1, "value1");
            assert.equal(result.allowedProp2, "value2");
            assert.equal(result.disallowedProp, undefined);
            assert.equal(result.allowedObjectProp.allowedSubProp, "value4");
            assert.equal(result.allowedObjectProp.disallowedSubProp, undefined);
            assert.equal(result.allowedObjectListProp[0].allowedSubProp, "value6");
            assert.equal(result.allowedObjectListProp[0].disallowedSubProp, undefined);
            assert.equal(result.allowedObjectListProp[1].allowedSubProp, "value8");
            assert.equal(result.allowedObjectListProp[1].disallowedSubProp, undefined);
        });
    });
    describe("#get", function() {
        it("should callback with error when store not found", function(done) {
            $db.get("UNKNOWN_STORE", "00000000-0000-0000-0000-000000000000", (e, d) => {
                assert.notEqual(e, null);
                assert.equal(e.message, "Store not found");
                done();
            });
        });
        it("should callback error when not found", function(done) {
            $db.get("users", "UNKNOWN_ID", (err, res) => {
                assert.notEqual(err, null);
                assert.equal(err.message, "Not found");
                done();
            });
        });
        it("should callback without error when not found and options.returnNull is true", function(done) {
            $db.get("users", "UNKNOWN_ID", { returnNull: true }, (e, d) => {
                assert.equal(e, null);
                assert.equal(d, null);
                done();
            });
        });
        it("should return item if it exists", function(done) {
            $db.get("users", "AAAAAAAA-0000-0000-0000-000000000000", (e, d) => {
                assert.equal(e, null);
                assert.equal(d.testProp, 40);
                done();
            });
        });
        it("should load virtual props", function(done) {
            $db.get("users", "AAAAAAAA-0000-0000-0000-000000000045", { loadVirtualProps: true }, (err, res) => {
                assert.equal(err, null);
                assert.equal(res.virtualProp, "toLoadVirtual_virtual");
                // assert.equal(res.objectOfVirtuals.nestedVirtualProp, "NESTED_PROPtoLoadVirtual");
                // assert.equal(res.objectListOfVirtuals[0].nestedVirtualProp, "toLoadVirtualNESTED_LIST_PROP1");
                // assert.equal(res.objectListOfVirtuals[1].nestedVirtualProp, "toLoadVirtualNESTED_LIST_PROP2");
                done();
            });
        });
        it("should load async virtual props", async () => {
            const item = await $db.get("storeWithVirtualProps", "1");
            assert.equal(item.asyncVirtualProp, "testName", "asyncVirtualProp should be filled");
            assert.equal(item.v1, "v1", "sync prop v1 should also be filled");
        });
        it("should return a Promise", function(done) {
            let mayBePromise = $db.get("users", "AAAAAAAA-0000-0000-0000-000000000000").then(res => {
                assert.ok(res != null);
                done();
            });
            assert.ok(mayBePromise instanceof Promise);
        });
        it("should return only requested properties", function() {
            return $db.get("users", "AAAAAAAA-0000-0000-0000-000000000000", { props: ["name"] }).then(res => {
                assert.ok(res != null);
                assert.equal(res._id, "AAAAAAAA-0000-0000-0000-000000000000");
                assert.equal(res.name, "testName");
                assert.equal(res.testProp, undefined);
            });
        });
    });
    describe("#count", function() {
        it("should return count of documents in store", function() {
            let count;
            const query = {
                query: {
                    testProp: {
                        $in: ["40", "44"],
                    },
                },
            };

            return $db
                .find("users", query)
                .then(res => {
                    count = res.count;
                    return $db.count("users", query.query);
                })
                .then(res => {
                    assert.equal(res, count);
                })
                .catch(err => {
                    console.error(err);
                    throw err;
                });
        });
    });
    describe("#find", () => {
        it("should return matched documents", () => {
            return $db
                .find("users", {
                    query: {
                        testProp: {
                            $in: ["40", "44"],
                        },
                    },
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.equal(res.count, 2);
                    assert.notEqual(res.items, null);
                    assert.equal(res.items.length, 2);
                });
        });
        it("should count matched documents", () => {
            return $db
                .find("users", {
                    query: {
                        testProp: {
                            $in: ["40", "44"],
                        },
                    },
                    take: 1,
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.equal(res.count, 2);
                    assert.notEqual(res.items, null);
                    assert.equal(res.items.length, 1);
                });
        });
        it("should sort matched documents correctly with string orderBy", () => {
            return $db
                .find("users", {
                    query: {
                        testProp: {
                            $in: ["40", "44"],
                        },
                    },
                    orderBy: "-testProp",
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.notEqual(res.items, null);
                    assert.equal(res.items[0].testProp, "44");
                });
        });
        it("should sort matched documents correctly with object orderBy", () => {
            return $db
                .find("users", {
                    query: {
                        testProp: {
                            $in: ["40", "44"],
                        },
                    },
                    orderBy: { testProp: -1 },
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.notEqual(res.items, null);
                    assert.equal(res.items[0].testProp, "44");
                });
        });
        it("should sort matched documents correctly with string orderBy contains two props", () => {
            return $db
                .find("users", {
                    query: {
                        testProp: {
                            $in: ["41", "40", "43", "42"],
                        },
                    },
                    orderBy: "login, -testProp",
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.notEqual(res.items, null);
                    const expected = [
                        { _id: "AAAAAAAA-0000-0000-0000-000000000002", testProp: "42", name: "testName", login: "11" },
                        { _id: "AAAAAAAA-0000-0000-0000-000000000003", testProp: "43", name: "name", login: "11" },
                        { _id: "AAAAAAAA-0000-0000-0000-000000000000", testProp: "40", name: "testName", login: "22" },
                        { _id: "AAAAAAAA-0000-0000-0000-000000000001", testProp: "41", name: "testName", login: "33" },
                    ];
                    assert.equal(res.items.length, expected.length);
                    for (let i = 0; i < res.items; i++) {
                        const item = res.items[i];
                        const expectedItem = expected[i];
                        assert.equal(item._id, expectedItem._id);
                        assert.equal(item.testProp, expectedItem.testProp);
                        assert.equal(item.login, expectedItem.login);
                    }
                });
        });
        it("should skip matched documents correctly", () => {
            return $db
                .find("users", {
                    query: {
                        testProp: {
                            $in: ["40", "41", "42", "43", "44"],
                        },
                    },
                    orderBy: "-_id",
                    skip: 2,
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.equal(res.count, 5);
                    assert.notEqual(res.items, null);
                    assert.equal(res.items.length, 3);
                    assert.equal(res.items[0].testProp, "42");
                });
        });
        it("should use store filters", () => {
            return $db
                .find("users", {
                    query: {
                        _default: "test",
                    },
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.equal(res.count, 3, "Documents count mismatched");
                    assert.notEqual(res.items, null);
                    assert.equal(res.items.length, 3);
                });
        });
        it("should use store promised filters", () => {
            return $db
                .find("users", {
                    query: {
                        promisedQuery: "test",
                    },
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.equal(res.count, 3, "Documents count mismatched");
                    assert.notEqual(res.items, null);
                    assert.equal(res.items.length, 3);
                });
        });
        it("should limit number of returned fields", () => {
            return $db
                .find("users", {
                    query: {},
                    orderBy: "-testProp",
                    props: ["name"],
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.notEqual(res.items, null);
                    res.items.forEach(item => {
                        assert.equal(item.testProp, null);
                        if (item._id === "AAAAAAAA-0000-0000-0000-000000000000") {
                            assert.equal(item.name, "testName");
                        }
                    });
                });
        });
    });
    describe("#forEach", function() {
        before(function(done) {
            db._insertMany(
                "forEachTestStore",
                [
                    { _id: "1", name: "testName1" },
                    { _id: "2", name: "testName2", _ownerId: "user" },
                    { _id: "3", name: "testName3", _ownerId: "user" },
                ],
                done
            );
        });
        it("should iterate over all items", function(done) {
            let id = 0;
            $db.forEach(
                "forEachTestStore",
                {},
                item => {
                    id++;
                    assert.equal(id, item._id);
                },
                () => {
                    assert.equal(id, 3);
                    done();
                }
            );
        });
        it("should iterate over only items matched query", function(done) {
            let id = 0;
            $db.forEach(
                "forEachTestStore",
                { name: "testName2" },
                item => {
                    assert.equal("2", item._id);
                    id++;
                },
                () => {
                    assert.equal(id, 1);
                    done();
                }
            );
        });
        it("should iterate over only items user has access to", function(done) {
            let id = 1;
            $db.forEach(
                "forEachTestStore",
                {},
                { user: { _id: "user", roles: ["anyUser"] } },
                item => {
                    id++;
                    assert.equal(id, item._id);
                },
                () => {
                    assert.equal(id, 3);
                    done();
                }
            );
        });
        it("should iterate over only items user has access to and only items matched query", function(done) {
            let id = 0;
            $db.forEach(
                "forEachTestStore",
                { $or: [{ name: "testName2" }, { name: "testName1" }] },
                { user: { _id: "user", roles: ["anyUser"] } },
                item => {
                    assert.equal("2", item._id);
                    id++;
                },
                () => {
                    assert.equal(id, 1);
                    done();
                }
            );
        });
        it("should wait if itemCb returns promise", function(done) {
            let count = 0;
            $db.forEach(
                "forEachTestStore",
                {},
                item => {
                    return new Promise(r =>
                        setTimeout(() => {
                            count++;
                            r();
                        }, 10)
                    );
                },
                () => {
                    assert.equal(count, 3);
                    done();
                }
            );
        });
    });
    describe("#set", function() {
        it("should return a Promise", function(done) {
            let mayBePromise = $db.set("anyStore", { name: "test" }).then(
                res => {},
                err => {
                    assert.ok(err != null);
                    done();
                }
            );
            assert.ok(mayBePromise instanceof Promise);
        });
        it("should sync concurrent operations", function() {
            let _id = "newId",
                promises = [];
            for (let i = 0; i < 50; i++) {
                promises.push($db.set("users", { _id: _id, intProp: i }));
            }
            return Promise.all(promises)
                .then(() => {
                    return $db.get("users", _id);
                })
                .then(res => {
                    assert.equal(res.__v, 50);
                    assert.ok(res.intProp >= 0);
                    assert.ok(res.intProp < 50);
                })
                .catch(err => {
                    assert.equal(err, null);
                });
        });
        it("should return error when new document saved with upsert = false option", function() {
            return $db.set("users", { _id: "1111", name: "NAME" }, { upsert: false }).then(
                res => {},
                err => {
                    assert.ok(err != null);
                }
            );
        });
        it("should remove properties in db when it's values equals null", function() {
            // TODO: it should REALLY remove such props
            return $db
                .set("users", { _id: "22222", name: "22222", email: "login@domain.com" })
                .then(res => {
                    assert.equal(res.email, "login@domain.com");
                    return $db.set("users", { _id: "22222", email: null }, { debug: true });
                })
                .then(res => {
                    assert.equal(res.email, null);
                });
        });

        it("trim values for string props and no trim if noAutoTrim option set", function() {
            return $db
                .set("users", {
                    _id: "22222",
                    name: "     22222        ",
                    email: "  login@domain.com \n",
                    noAutoTrimmedProp: "  space surround text  ",
                })
                .then(res => {
                    assert.equal(res.email, "login@domain.com");
                    assert.equal(res.name, "22222");
                    assert.equal(res.noAutoTrimmedProp, "  space surround text  ");
                });
        });

        it("should log changes if logging options enabled in storeDesc", function() {
            const storeName = "storeWithLogging";
            let _id, updatedAt, updatedBy;
            const originalItem = { loggedProp: "initial value" };
            return $db
                .insert(storeName, originalItem)
                .then(res => {
                    _id = res._id;
                    const updatedItem = { _id, loggedProp: "updated value" };

                    return $db.set(storeName, updatedItem);
                })
                .then(res => {
                    updatedAt = res.updatedAt;
                    updatedBy = res.updatedBy;

                    return db.get(`${storeName}_log`, { itemId: _id });
                })
                .then(res => {
                    assert.equal(res.createdAt.getTime(), updatedAt.getTime());
                    assert.equal(res.createdBy, updatedBy);
                    assert.equal(res.ver, 2);
                    assert.equal(res.prevVer, 1);

                    return $db.set(storeName, { _id, loggedProp: "last value" });
                })
                .then(res => {
                    assert.equal(res.loggedProp, "last value");

                    return $db.get(storeName, { _id, __v: 1 });
                })
                .then(res => {
                    assert.equal(res.loggedProp, originalItem.loggedProp);

                    return $db.get(storeName, { _id, __v: 2 });
                })
                .then(res => {
                    assert.equal(res.loggedProp, "updated value");
                });
        });
    });
    describe("#insert", function() {
        it("should return item with generated '_id'", function(done) {
            $db.insert("users", { name: "test" }, function(err, item) {
                assert.equal(err, null, "returned error");
                assert.ok(item._id, "no '_id' in item");
                done();
            });
        });
        it("should return created item from db", function(done) {
            $db.insert("users", { name: "test" }, function(err, item) {
                assert.equal(err, null);
                assert.ok(item._id, "no '_id' in item");
                $db.get("users", item._id, (err, $item) => {
                    assert.equal(err, null, "returned error");
                    assert.equal($item.name, "test");
                    done();
                });
            });
        });
        it("should add correct _ownerId, createdBy and createdAt", function(done) {
            $db.insert("users", { name: "test" }, function(err, item) {
                assert.equal(err, null, "returned error");
                assert.equal(item._ownerId, "system");
                assert.ok(item.createdBy);
                assert.ok(item.createdAt);
                done();
            });
        });
        it("should return modified item when willCreate called", function(done) {
            $db.insert("users", { name: "test", testProp: "notError" }, function(err, item) {
                assert.equal(err, null);
                assert.equal(item.testProp, "42");
                done();
            });
        });
        it("should return error when willCreate returns error", function(done) {
            $db.insert("users", { name: "test", testProp: "Error" }, function(err, item) {
                assert.notEqual(err, null);
                assert.equal(err.message, "Error");
                done();
            });
        });
        it("should return a Promise", function(done) {
            const mayBePromise = $db.insert("anyStore", { name: "test" }).then(
                res => {},
                err => {
                    assert.ok(err != null);
                    done();
                }
            );
            assert.ok(mayBePromise instanceof Promise);
        });
        it("should fill default prop's values if they is not exists", function() {
            return $db.insert("users", { name: "testWithDefault" }).then(res => {
                assert(res.propWithDefault, "defaultValue");
                assert(res.propWithDefaultExpression, 42);
            });
        });
        it("should keep passed prop's values if they exists", function() {
            return $db.insert("users", { name: "testWithDefault", propWithDefault: "anotherValue" }).then(res => {
                assert(res.propWithDefault, "anotherValue");
            });
        });
    });
    describe("#_mergeItems", function() {
        it("should merge all props in two items", function() {
            let prevItem = { prop1: "prop1", prop2: "prop2" };
            let item = { prop2: "another value", prop3: "prop3" };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.equal(prevItem.prop1, "prop1");
            assert.equal(prevItem.prop2, "another value");
            assert.equal(prevItem.prop3, "prop3");
        });
        it("should increment value", function() {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: 2 };
            let item = { prop3: { $inc: 2 }, newProp: { $inc: -1 } };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.equal(prevItem.prop3, 2);
            assert.equal(prevItem.newProp, 1);
        });
        it("should return error when incremented value is not a number", function() {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: 2 };
            let item = { prop2: { $inc: 2 } };
            let err = db._mergeItems(prevItem, item);
            assert.notEqual(err, null);
        });
        it("should push new value to array property", function() {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: [1] };
            let item = { prop3: { $push: 2 }, newProp: { $push: 2 } };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.deepEqual(prevItem.prop3, [2]);
            assert.deepEqual(prevItem.newProp, [1, 2]);
        });
        it("should push all values from provided array to array property", function() {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: [1] };
            let item = { prop3: { $push: [2, 6] }, newProp: { $push: [2, 3, 4] } };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.deepEqual(prevItem.prop3, [2, 6]);
            assert.deepEqual(prevItem.newProp, [1, 2, 3, 4]);
        });
        it("should return error when pushed property value was not an array", function() {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: 2 };
            let item = { prop2: { $push: 2 } };
            let err = db._mergeItems(prevItem, item);
            assert.notEqual(err, null);
        });
    });
    describe("#populateAll", function() {
        it("should populate user prop correctly and execute callback", function(done) {
            let item = {
                userId: "AAAAAAAA-0000-0000-0000-000000000004",
                userIds: ["AAAAAAAA-0000-0000-0000-000000000004", "AAAAAAAA-0000-0000-0000-000000000003"],
            };
            $db.getUser("system", (err, user) => {
                $db.populateAll("storeForPopulating", item, user, (err, res) => {
                    assert.equal(err, null);
                    assert.ok(res.user);
                    assert.equal(res.user.testProp, "44");
                    assert.equal(res.userList[0].testProp, "44");
                    assert.equal(res.userList[1].testProp, "43");
                    done();
                });
            });
        });
        it("should populate user with map function correctly and execute callback", function(done) {
            let item = {
                userId: "AAAAAAAA-0000-0000-0000-000000000004",
                userIds: ["AAAAAAAA-0000-0000-0000-000000000004", "AAAAAAAA-0000-0000-0000-000000000003"],
            };
            $db.getUser("system", (err, user) => {
                $db.populateAll("storeForPopulatingMap", item, user, (err, res) => {
                    assert.equal(err, null);
                    assert.ok(res.userTestProp);
                    assert.equal(res.userTestProp, "44");
                    assert.equal(res.userList[0], "44");
                    assert.equal(res.userList[1], "43");
                    done();
                });
            });
        });
    });
    describe("#delete", function() {
        it("should mark item as deleted and move to ${storeName}_deleted bucket", function(done) {
            $db.delete("users", "AAAAAAAA-0000-0000-0000-000000000042", err => {
                assert.equal(err, null);
                db.get("users_deleted", "AAAAAAAA-0000-0000-0000-000000000042", (err, item) => {
                    assert.equal(err, null);
                    assert.equal(item.testProp, "toDelete");
                    assert.ok(item._deleted);
                    done();
                });
            });
        });
        it("should return deleted item by _id and item should be marked as deleted", function(done) {
            $db.delete("users", "AAAAAAAA-0000-0000-0000-000000000043", err => {
                $db.get("users", "AAAAAAAA-0000-0000-0000-000000000043", { deleted: true }, (err, item) => {
                    assert.equal(err, null);
                    assert.equal(item.testProp, "toDelete2");
                    assert.ok(item._deleted);
                    done();
                });
            });
        });
        it("should return error if willDelete hook return Promise that rejected", function(done) {
            $db.delete("users", "AAAAAAAA-0000-0000-0000-000000000044", err => {
                assert.notEqual(err, null);
                assert.equal(err.message, "NO_DELETE");
                $db.get("users", "AAAAAAAA-0000-0000-0000-000000000044", { deleted: true }, (err, item) => {
                    assert.equal(err, null);
                    assert.ok(!item._deleted);
                    done();
                });
            });
        });
        it("should return a Promise", function(done) {
            let mayBePromise = $db.delete("users", "UNKNOWN").then(res => {}, err => done());
            assert.ok(mayBePromise instanceof Promise);
        });
        it("should completly deleted item by _id when 'drop' options provided", function(done) {
            $db.delete("users", "AAAAAAAA-0000-0000-0000-000000000045", { drop: true }, err => {
                $db.get("users", "AAAAAAAA-0000-0000-0000-000000000045", { deleted: true }, (err, item) => {
                    assert.equal(err.message, "Not found");
                    done();
                });
            });
        });
    });
    describe("#nextSequence", function() {
        before(function(done) {
            db._dropCollection("_sequences", done);
        });
        it("should return next sequence number when first $db.nextSequence called", function(done) {
            $db.nextSequence("users", function(err, sequence) {
                assert.equal(err, null);
                assert.strictEqual(sequence, 1);
                $db.nextSequence("users", function(err, sequence) {
                    assert.equal(err, null);
                    assert.strictEqual(sequence, 2);
                    done();
                });
            });
        });
    });
    describe("#nextSequenceString", function() {
        before(function(done) {
            db._dropCollection("_sequences", done);
        });
        it("should return next sequence number when first $db.nextSequence called", function(done) {
            $db.nextSequenceString("users", function(err, sequence) {
                assert.equal(err, null);
                assert.strictEqual(sequence, "000001");
                $db.nextSequenceString("users", 3, function(err, sequence) {
                    assert.equal(err, null);
                    assert.strictEqual(sequence, "002");
                    done();
                });
            });
        });
    });
    describe("#customId", function() {
        before(function(done) {
            db._dropCollection("_sequences", done);
        });
        it("should return custom string _id for saving document", function() {
            return $db
                .insert("storeWithCustomStringId", { name: "42" })
                .then(res => {
                    assert.equal(res.name, "42");
                    assert.equal(res._id, "1");
                    return $db.insert("storeWithCustomStringId", { name: "43" });
                })
                .then(res => {
                    assert.equal(res.name, "43");
                    assert.equal(res._id, "2");
                });
        });
        it("should return custom string _id for saving document based on document", function() {
            return $db.insert("storeWithCustomStringIdBasedOnItem", { name: "42" }).then(res => {
                assert.equal(res.name, "42");
                assert.equal(res._id, "42");
            });
        });
        it("should return custom int _id for saving document", function() {
            return $db
                .insert("storeWithCustomIntId", { name: "42" })
                .then(res => {
                    assert.equal(res.name, "42");
                    assert.equal(res._id, 1);
                    return $db.insert("storeWithCustomIntId", { name: "43" });
                })
                .then(res => {
                    assert.equal(res.name, "43");
                    assert.equal(res._id, 2);
                });
        });
    });
    describe("#notify", () => {
        beforeEach(() => {
            return db._dropCollection("partialTestsNotificationStore");
        });
        it("should create documents in 'partialTestsNotificationStore' for all receivers when notify called", () => {
            const receivers = ["AAAAAAAA-0000-0000-0000-000000000000", "AAAAAAAA-0000-0000-0000-000000000001"];
            return $db
                .notify("partialTestsNotificationStore", receivers, "Hello")
                .then(res => {
                    return $db.find("partialTestsNotificationStore", { query: {} });
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.equal(res.count, 2);
                    assert.equal(res.items[0].message, "Hello");
                    assert.equal(res.items[0].event, "notification");
                    assert.equal(res.items[0].level, "info");
                });
        });
        it("should create documents in 'partialTestsNotificationStore' for one receiver passed as string when notify called", () => {
            const receivers = "AAAAAAAA-0000-0000-0000-000000000000";
            return $db
                .notify("partialTestsNotificationStore", receivers, "Hello, receiver")
                .then(res => {
                    return $db.find("partialTestsNotificationStore", { query: {} });
                })
                .then(res => {
                    assert.notEqual(res, null);
                    assert.equal(res.count, 1);
                    assert.equal(res.items[0].message, "Hello, receiver");
                    assert.equal(res.items[0].event, "notification");
                    assert.equal(res.items[0].level, "info");
                });
        });
    });

    describe("#transactions", () => {
        if (process.env.MONGO_PORT_27017_VERSION !== "4") {
            return;
        }

        it("should commit changes to DB", async () => {
            let tx;
            try {
                tx = $db.begin();

                await tx.set("users", { _id: "AAAAAAAA-0000-0000-0000-000000000000", txProp: "first value" });
                await tx.set("users", { _id: "AAAAAAAA-0000-0000-0000-000000000001", txProp: "second value" });
                const savedItem1 = await tx.get("users", "AAAAAAAA-0000-0000-0000-000000000000");
                assert.equal(savedItem1.txProp, "first value");
                const dbItem1 = await $db.get("users", "AAAAAAAA-0000-0000-0000-000000000000");
                assert.equal(dbItem1.txProp, null);
                const savedItem2 = await tx.get("users", "AAAAAAAA-0000-0000-0000-000000000001");
                assert.equal(savedItem2.txProp, "second value");
                const dbItem2 = await $db.get("users", "AAAAAAAA-0000-0000-0000-000000000001");
                assert.equal(dbItem2.txProp, null);

                await tx.commit();
                const commitedItem1 = await $db.get("users", "AAAAAAAA-0000-0000-0000-000000000000");
                assert.equal(commitedItem1.txProp, "first value");
                const commitedItem2 = await $db.get("users", "AAAAAAAA-0000-0000-0000-000000000001");
                assert.equal(commitedItem2.txProp, "second value");
            } finally {
                await tx.rollback();
            }
        });

        it("should rollback changes to DB", async () => {
            let tx;
            try {
                await $db.set("users", { _id: "AAAAAAAA-0000-0000-0000-000000000000", txProp: null });
                await $db.set("users", { _id: "AAAAAAAA-0000-0000-0000-000000000001", txProp: null });

                tx = $db.begin();

                await tx.set("users", {
                    _id: "AAAAAAAA-0000-0000-0000-000000000000",
                    txProp: "first value to rollback",
                });
                await tx.set("users", {
                    _id: "AAAAAAAA-0000-0000-0000-000000000001",
                    txProp: "second value to rollback",
                });
                const savedItem1 = await tx.get("users", "AAAAAAAA-0000-0000-0000-000000000000");
                assert.equal(savedItem1.txProp, "first value to rollback");
                const dbItem1 = await $db.get("users", "AAAAAAAA-0000-0000-0000-000000000000");
                assert.equal(dbItem1.txProp, null);
                const savedItem2 = await tx.get("users", "AAAAAAAA-0000-0000-0000-000000000001");
                assert.equal(savedItem2.txProp, "second value to rollback");
                const dbItem2 = await $db.get("users", "AAAAAAAA-0000-0000-0000-000000000001");
                assert.equal(dbItem2.txProp, null);

                await tx.rollback();
                const canceledItem1 = await $db.get("users", "AAAAAAAA-0000-0000-0000-000000000000");
                assert.equal(canceledItem1.txProp, null);
                const canceledItem2 = await $db.get("users", "AAAAAAAA-0000-0000-0000-000000000001");
                assert.equal(canceledItem2.txProp, null);
            } finally {
                await tx.rollback();
            }
        });

        it("should delete item after commit TX", async () => {
            let tx;
            try {
                await $db.set("users", { _id: "tmp", txProp: "tmp" });

                tx = $db.begin();
                await tx.delete("users", "tmp");
                let item = await $db.get("users", "tmp");
                assert.equal(item.txProp, "tmp");
                item = await tx.get("users", "tmp", { returnNull: true });
                assert.equal(item, null);

                await tx.commit();
                item = await $db.get("users", "tmp", { returnNull: true });
                assert.equal(item, null);
            } finally {
                await tx.rollback();
            }
        });
    });

    after(async () => {
        // await db._dropCollection("users");
        await db._dropCollection("users_deleted");
        await db._dropCollection("forEachTestStore");
        await db._dropCollection("partialTestsNotificationStore");
        await db._dropCollection("storeWithLogging");
        await db._dropCollection("storeWithLogging_log");
        await db._dropCollection("_sequences");
        await db._dropCollection("storeWithCustomIntId");
        await db._dropCollection("storeWithCustomStringId");
        await db._dropCollection("storeWithCustomStringIdBasedOnItem");
    });
});
