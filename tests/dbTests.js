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

describe("$db", () => {
    before(done => {
        $db.setupMongo("mongodb://127.0.0.1:27017/blankTest");
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
    describe("#_copyReadableItemProps", () => {
        it("should return only items user has access to", () => {
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
    describe("#get", () => {
        it("should throw error when store not found", () => {
            return $db
                .get("UNKNOWN_STORE", "UNKNOWN_ID")
                .then(() => {
                    throw new Error("should not resolve");
                })
                .catch(err => {
                    assert.notEqual(err, null);
                    assert.equal(err.message, "Store not found");
                });
        });
        it("should throw error when not found", () => {
            return $db
                .get("users", "UNKNOWN_ID")
                .then(res => {
                    throw new Error("should not resolve");
                })
                .catch(err => {
                    assert.notEqual(err, null);
                    assert.equal(err.message, "Not found");
                });
        });
        it("should return null when not found and options.returnNull is true", () => {
            $db.get("users", "UNKNOWN_ID", { returnNull: true }).then(res => {
                assert.equal(res, null);
            });
        });
        it("should return item if it exists", () => {
            $db.get("users", "AAAAAAAA-0000-0000-0000-000000000000").then(res => {
                assert.equal(res.testProp, 40);
            });
        });
        it("should load virtual props", () => {
            $db.get("users", "AAAAAAAA-0000-0000-0000-000000000045", { noLoadVirtualProps: false }).then(res => {
                assert.equal(res.virtualProp, "toLoadVirtual_virtual");
            });
        });
        it("should load async virtual props", async () => {
            const item = await $db.get("storeWithVirtualProps", "1");
            assert.equal(item.asyncVirtualProp, "testName", "asyncVirtualProp should be filled");
            assert.equal(item.v1, "v1", "sync prop v1 should also be filled");
        });
        it("should return only requested properties", () => {
            return $db.get("users", "AAAAAAAA-0000-0000-0000-000000000000", { props: ["name"] }).then(res => {
                assert.ok(res != null);
                assert.equal(res._id, "AAAAAAAA-0000-0000-0000-000000000000");
                assert.equal(res.name, "testName");
                assert.equal(res.testProp, undefined);
            });
        });
    });
    describe("#count", () => {
        it("should return count of documents in store", () => {
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
    describe("#forEach", () => {
        before(done => {
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
        it("should iterate over all items", done => {
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
        it("should iterate over only items matched query", done => {
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
        it("should iterate over only items user has access to", done => {
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
        it("should iterate over only items user has access to and only items matched query", done => {
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
        it("should wait if itemCb returns promise", done => {
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
    describe("#set", () => {
        it("should return a Promise", done => {
            let mayBePromise = $db.set("anyStore", { name: "test" }).then(
                res => {},
                err => {
                    assert.ok(err != null);
                    done();
                }
            );
            assert.ok(mayBePromise instanceof Promise);
        });
        it("should sync concurrent operations", () => {
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
        it("should return error when new document saved with upsert = false option", () => {
            return $db.set("users", { _id: "1111", name: "NAME" }, { upsert: false }).then(
                res => {},
                err => {
                    assert.ok(err != null);
                }
            );
        });
        it("should remove properties in db when it's values equals null", () => {
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

        it("trim values for string props and no trim if noAutoTrim option set", () => {
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

        it("should log changes if logging options enabled in storeDesc", () => {
            const storeName = "storeWithLogging";
            let _id, updatedAt, updatedBy;
            const originalItem = { loggedProp: "initial value" };
            return $db
                .insert(storeName, originalItem)
                .then(res => {
                    _id = res._id;
                    const updatedItem = {
                        _id,
                        loggedProp: "updated value",
                        obj: { str: "val" },
                        ol: [{ str: "strVal" }],
                    };

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

                    return $db.set(storeName, {
                        _id,
                        loggedProp: "last value",
                        obj: { str: "last val" },
                        ol: [{ str: "last strVal" }],
                    });
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
                    assert.equal(res.obj.str, "val");
                    assert.equal(res.ol[0].str, "strVal");
                });
        });
        it("should rewrite existing item, when noMerge option passed", async () => {
            // const item = await $db.insert("users", { email: "User@ForMe.rge" });
            // const newItem = { _id: item._id, testProp: "Test Prop For Merge" };
            // await $db.set("users", newItem, { noMerge: true });
            // const saved = await $db.get("users", item._id);
            // assert.equal(saved.testProp, newItem.testProp);
            // assert.ok(saved.email === undefined);
        });
    });
    describe("#insert", () => {
        it("should return item with generated '_id'", async () => {
            const item = await $db.insert("users", { name: "test" });
            assert.ok(item._id, "no '_id' in item");
        });
        it("should return created item from db", async () => {
            const item = await $db.insert("users", { name: "test" });
            assert.ok(item._id, "no '_id' in item");
            const $item = await $db.get("users", item._id);
            assert.equal($item.name, "test");
        });
        it("should add correct _ownerId, createdBy and createdAt", async () => {
            const item = await $db.insert("users", { name: "test" });
            assert.equal(item._ownerId, "system");
            assert.ok(item.createdBy);
            assert.ok(item.createdAt);
        });
        it("should return modified item when willCreate called", async () => {
            const item = await $db.insert("users", { name: "test", testProp: "notError" });
            assert.equal(item.testProp, "42");
        });
        it("should return error when willCreate returns error", async () => {
            try {
                await $db.insert("users", { name: "test", testProp: "Error" });
                throw new Error("should not resolve");
            } catch (err) {
                assert.equal(err.message, "Error");
            }
        });
        it("should fill default prop's values if they is not exists", () => {
            return $db.insert("users", { name: "testWithDefault" }).then(res => {
                assert(res.propWithDefault, "defaultValue");
                assert(res.propWithDefaultExpression, 42);
            });
        });
        it("should keep passed prop's values if they exists", () => {
            return $db.insert("users", { name: "testWithDefault", propWithDefault: "anotherValue" }).then(res => {
                assert(res.propWithDefault, "anotherValue");
            });
        });
    });
    describe("#_mergeItems", () => {
        it("should merge all props in two items", () => {
            let prevItem = { prop1: "prop1", prop2: "prop2" };
            let item = { prop2: "another value", prop3: "prop3" };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.equal(prevItem.prop1, "prop1");
            assert.equal(prevItem.prop2, "another value");
            assert.equal(prevItem.prop3, "prop3");
        });
        it("should increment value", () => {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: 2 };
            let item = { prop3: { $inc: 2 }, newProp: { $inc: -1 } };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.equal(prevItem.prop3, 2);
            assert.equal(prevItem.newProp, 1);
        });
        it("should return error when incremented value is not a number", () => {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: 2 };
            let item = { prop2: { $inc: 2 } };
            let err = db._mergeItems(prevItem, item);
            assert.notEqual(err, null);
        });
        it("should push new value to array property", () => {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: [1] };
            let item = { prop3: { $push: 2 }, newProp: { $push: 2 } };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.deepEqual(prevItem.prop3, [2]);
            assert.deepEqual(prevItem.newProp, [1, 2]);
        });
        it("should push all values from provided array to array property", () => {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: [1] };
            let item = { prop3: { $push: [2, 6] }, newProp: { $push: [2, 3, 4] } };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.deepEqual(prevItem.prop3, [2, 6]);
            assert.deepEqual(prevItem.newProp, [1, 2, 3, 4]);
        });
        it("should return error when pushed property value was not an array", () => {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: 2 };
            let item = { prop2: { $push: 2 } };
            let err = db._mergeItems(prevItem, item);
            assert.notEqual(err, null);
        });
    });
    describe("#populateAll", () => {
        it("should populate user prop correctly and execute callback", async () => {
            const item = {
                userId: "AAAAAAAA-0000-0000-0000-000000000004",
                userIds: ["AAAAAAAA-0000-0000-0000-000000000004", "AAAAAAAA-0000-0000-0000-000000000003"],
                refObject: { store: "users", _id: "AAAAAAAA-0000-0000-0000-000000000003" },
            };
            const user = await $db.getUser("system");
            const res = await $db.populateAll("storeForPopulating", item, user);
            assert.ok(res.user);
            assert.equal(res.user.testProp, "44");
            assert.equal(res.userList[0].testProp, "44");
            assert.equal(res.userList[1].testProp, "43");
            assert.equal(res.refo.testProp, "43");
        });
        it("should populate user with map function correctly and execute callback", async () => {
            const item = {
                userId: "AAAAAAAA-0000-0000-0000-000000000004",
                userIds: ["AAAAAAAA-0000-0000-0000-000000000004", "AAAAAAAA-0000-0000-0000-000000000003"],
            };

            const user = await $db.getUser("system");
            const res = await $db.populateAll("storeForPopulatingMap", item, user);
            assert.ok(res.userTestProp);
            assert.equal(res.userTestProp, "44");
            assert.equal(res.userList[0], "44");
            assert.equal(res.userList[1], "43");
        });
    });
    describe("#delete", () => {
        it("should mark item as deleted and move to ${storeName}_deleted bucket", () => {
            return $db
                .delete("users", "AAAAAAAA-0000-0000-0000-000000000042")
                .then(() => {
                    return db.get("users_deleted", "AAAAAAAA-0000-0000-0000-000000000042");
                })
                .then(res => {
                    assert.equal(res.testProp, "toDelete");
                    assert.ok(res._deleted);
                });
        });
        xit("should return deleted item by _id and item should be marked as deleted", () => {
            return $db
                .delete("users", "AAAAAAAA-0000-0000-0000-000000000043")
                .then(() => $db.get("users", "AAAAAAAA-0000-0000-0000-000000000043", { deleted: true }))
                .then(item => {
                    assert.equal(item.testProp, "toDelete2");
                    assert.ok(item._deleted);
                });
        });
        it("should return error if willDelete hook return Promise that rejected", () => {
            return $db
                .delete("users", "AAAAAAAA-0000-0000-0000-000000000044")
                .then(() => {
                    throw new Error("show not resolve");
                })
                .catch(err => {
                    assert.equal(err.message, "NO_DELETE");
                })
                .then(() => $db.get("users", "AAAAAAAA-0000-0000-0000-000000000044", { deleted: true }))
                .then(item => {
                    assert.ok(!item._deleted);
                });
        });
        it("should completly deleted item by _id when 'drop' options provided", async () => {
            await $db.delete("users", "AAAAAAAA-0000-0000-0000-000000000045", { drop: true });
            try {
                await $db.get("users", "AAAAAAAA-0000-0000-0000-000000000045", { deleted: true });
                throw new Error("should not resolve");
            } catch (err) {
                assert.equal(err.message, "Not found");
            }
        });
    });
    describe("#nextSequence", () => {
        before(done => {
            db._dropCollection("_sequences", done);
        });
        it("should return next sequence number when first $db.nextSequence called", () => {
            return $db
                .nextSequence("users")
                .then(sequence => {
                    assert.strictEqual(sequence, 1);
                    return $db.nextSequence("users");
                })
                .then(sequence => {
                    assert.strictEqual(sequence, 2);
                });
        });
    });
    describe("#nextSequenceString", () => {
        before(done => {
            db._dropCollection("_sequences", done);
        });
        it("should return next sequence number when first $db.nextSequence called", () => {
            return $db
                .nextSequenceString("users")
                .then(sequence => {
                    assert.strictEqual(sequence, "000001");
                    return $db.nextSequenceString("users", 3);
                })
                .then(sequence => {
                    assert.strictEqual(sequence, "002");
                });
        });
    });
    describe("#customId", () => {
        before(done => {
            db._dropCollection("_sequences", done);
        });
        it("should return custom string _id for saving document", () => {
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
        it("should return custom string _id for saving document based on document", () => {
            return $db.insert("storeWithCustomStringIdBasedOnItem", { name: "42" }).then(res => {
                assert.equal(res.name, "42");
                assert.equal(res._id, "42");
            });
        });
        it("should return custom int _id for saving document", () => {
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
