"use strict";

var assert = require("assert");
var testConfig = require("./config");
var configStore = require("../lib/configStore");
configStore.setup(testConfig);
var db = require("../lib/db/rawDb");
var $db = require("../lib/db/index");


describe("$db", function () {
    before(function (done) {
        $db.setup("mongodb://127.0.0.1:27017/blankTest");
        db.on("connected", () => {
            db._insertMany([
                { "_id": "AAAAAAAA-0000-0000-0000-000000000000", "testProp": "40", "name": "testName" },
                { "_id": "AAAAAAAA-0000-0000-0000-000000000001", "testProp": "41", "name": "testName" },
                { "_id": "AAAAAAAA-0000-0000-0000-000000000002", "testProp": "42", "name": "testName" },
                { "_id": "AAAAAAAA-0000-0000-0000-000000000003", "testProp": "43", "name": "name" },
                { "_id": "AAAAAAAA-0000-0000-0000-000000000004", "testProp": "44" },
                { "_id": "AAAAAAAA-0000-0000-0000-000000000042", "testProp": "toDelete" },
                { "_id": "AAAAAAAA-0000-0000-0000-000000000043", "testProp": "toDelete2" },
                { "_id": "AAAAAAAA-0000-0000-0000-000000000044", "testProp": "toDelete3" },
                {
                    "_id": "AAAAAAAA-0000-0000-0000-000000000045",
                    "testProp": "toLoadVirtual",
                    "objectOfVirtuals": {
                        "nestedProp": "NESTED_PROP",
                    },
                    "objectListOfVirtuals": [
                        { "nestedProp": "NESTED_LIST_PROP1" },
                        { "nestedProp": "NESTED_LIST_PROP2" },
                    ],
                },
            ],
                "users",
                done);
        });
    });
    describe("#get", function () {
        it("should callback with error when store not found", function (done) {
            $db.get("00000000-0000-0000-0000-000000000000", "UNKNOWN_STORE", (e, d) => {
                assert.notEqual(e, null);
                assert.equal(e.message, "Store not found");
                done();
            });
        });
        it("should callback error when not found", function (done) {
            $db.get("UNKNOWN_ID", "users", (e, d) => {
                assert.notEqual(e, null);
                assert.equal(e.message, "Not found");
                done();
            });
        });
        it("should return item if it exists", function (done) {
            $db.get("AAAAAAAA-0000-0000-0000-000000000000", "users", (e, d) => {
                assert.equal(e, null);
                assert.equal(d.testProp, 40);
                done();
            });
        });
        it("should load virtual props", function (done) {
            $db.get("AAAAAAAA-0000-0000-0000-000000000045", "users", { loadVirtualProps: true }, (err, res) => {
                assert.equal(err, null);
                assert.equal(res.virtualProp, "toLoadVirtual_virtual");
                assert.equal(res.objectOfVirtuals.nestedVirtualProp, "NESTED_PROPtoLoadVirtual");
                assert.equal(res.objectListOfVirtuals[0].nestedVirtualProp, "toLoadVirtualNESTED_LIST_PROP1");
                assert.equal(res.objectListOfVirtuals[1].nestedVirtualProp, "toLoadVirtualNESTED_LIST_PROP2");
                done();
            });
        });
    });
    describe("#find", function () {
        it("should return matched documents", function (done) {
            $db.find({
                query: {
                    "testProp": {
                        "$in": ["40", "44"],
                    },
                },
            }, "users", (e, res) => {
                assert.equal(e, null);
                assert.notEqual(res, null);
                assert.equal(res.count, 2);
                assert.notEqual(res.items, null);
                assert.equal(res.items.length, 2);
                done();
            });
        });
        it("should count matched documents", function (done) {
            $db.find({
                query: {
                    "testProp": {
                        "$in": ["40", "44"],
                    },
                },
                take: 1,
            }, "users", (e, res) => {
                assert.equal(e, null);
                assert.notEqual(res, null);
                assert.equal(res.count, 2);
                assert.notEqual(res.items, null);
                assert.equal(res.items.length, 1);
                done();
            });
        });
        it("should sort matched documents correctly", function (done) {
            $db.find({
                query: {
                    "testProp": {
                        "$in": ["40", "44"],
                    },
                },
                orderBy: "-testProp",
            }, "users", (e, res) => {
                assert.equal(e, null);
                assert.notEqual(res, null);
                assert.notEqual(res.items, null);
                assert.equal(res.items[0].testProp, "44");
                done();
            });
        });
        it("should skip matched documents correctly", function (done) {
            $db.find({
                query: {
                    "testProp": {
                        "$in": ["40", "41", "42", "43", "44"],
                    },
                },
                orderBy: "-_id",
                skip: 2,
            }, "users", (e, res) => {
                assert.equal(e, null);
                assert.notEqual(res, null);
                assert.equal(res.count, 5);
                assert.notEqual(res.items, null);
                assert.equal(res.items.length, 3);
                assert.equal(res.items[0].testProp, "42");
                done();
            });
        });
        it("should use store filters", function (done) {
            $db.find({
                query: {
                    _default: "test",
                },
            }, "users", (e, res) => {
                assert.equal(e, null);
                assert.notEqual(res, null);
                assert.equal(res.count, 3, "Documents count mismatched");
                assert.notEqual(res.items, null);
                assert.equal(res.items.length, 3);
                done();
            });
        });
    });
    describe("#set", function () {
        it("should return a Promise", function (done) {
            let mayBePromise = $db.set({ "name": "test" }, "anyStore").then((res) => {
            }, (err) => {
                assert.ok(err != null);
                done();
            });
            assert.ok(mayBePromise instanceof Promise);
        });
        it("should retry to set with version", function (done) {
            let _id = "newId";
            for (let i = 0; i < 50; i++) {
                $db.set({ "_id": _id, prop: i }, "users", (err, data) => {
                    assert.equal(err, null);
                });
            }
            setTimeout(() => {
                $db.get(_id, "users", (err, res) => {
                    assert.equal(err, null);
                    assert.equal(res.__v, 50);
                    assert.ok(res.prop >= 0);
                    assert.ok(res.prop < 50);
                    done();
                });
            }, 1000);
        });
    });
    describe("#insert", function () {
        it("should return item with generated '_id'", function (done) {
            $db.insert({ "name": "test" }, "users", function (err, item) {
                assert.equal(err, null, "returned error");
                assert.ok(item._id, "no '_id' in item");
                done();
            });
        });
        it("should return created item from db", function (done) {
            $db.insert({ "name": "test" }, "users", function (err, item) {
                assert.equal(err, null);
                assert.ok(item._id, "no '_id' in item");
                $db.get(item._id, "users", (err, $item) => {
                    assert.equal(err, null, "returned error");
                    assert.equal($item.name, "test");
                    done();
                });
            });
        });
        it("should add correct _ownerId, createdBy and createdAt", function (done) {
            $db.insert({ "name": "test" }, "users", function (err, item) {
                assert.equal(err, null, "returned error");
                assert.equal(item._ownerId, "system");
                assert.ok(item.createdBy);
                assert.ok(item.createdAt);
                done();
            });
        });
        it("should return modify item when willCreate called", function (done) {
            $db.insert({ "name": "test", "testProp": "notError" }, "users", function (err, item) {
                assert.equal(err, null);
                assert.equal(item.testProp, "42");
                done();
            });
        });
        it("should return error when willCreate returns error", function (done) {
            $db.insert({ "name": "test", "testProp": "Error" }, "users", function (err, item) {
                assert.notEqual(err, null);
                assert.equal(err.message, "Error");
                done();
            });
        });
    });
    describe("#_mergeItems", function () {
        it("should merge all props in two items", function () {
            let prevItem = { prop1: "prop1", prop2: "prop2" };
            let item = { prop2: "another value", prop3: "prop3" };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.equal(prevItem.prop1, "prop1");
            assert.equal(prevItem.prop2, "another value");
            assert.equal(prevItem.prop3, "prop3");
        });
        it("should increment value", function () {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: 2 };
            let item = { prop3: { $inc: 2 }, newProp: { $inc: -1 } };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.equal(prevItem.prop3, 2);
            assert.equal(prevItem.newProp, 1);
        });
        it("should return error when incremented value is not a number", function () {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: 2 };
            let item = { prop2: { $inc: 2 } };
            let err = db._mergeItems(prevItem, item);
            assert.notEqual(err, null);
        });
        it("should push new value to array property", function () {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: [1] };
            let item = { prop3: { $push: 2 }, newProp: { $push: 2 } };
            let err = db._mergeItems(prevItem, item);
            assert.equal(err, null);
            assert.deepEqual(prevItem.prop3, [2]);
            assert.deepEqual(prevItem.newProp, [1, 2]);
        });
        it("should return error when pushed property value was not an array", function () {
            let prevItem = { prop1: "prop1", prop2: "prop2", newProp: 2 };
            let item = { prop2: { $push: 2 } };
            let err = db._mergeItems(prevItem, item);
            assert.notEqual(err, null);
        });
    });
    describe("#populateAll", function () {
        it("should populate user prop correctly and execute callback", function (done) {
            let item = { userId: "AAAAAAAA-0000-0000-0000-000000000004" };
            $db.getUser("system", (err, user) => {
                $db.populateAll(item, "storeForPopulating", user, (err, res) => {
                    assert.equal(err, null);
                    assert.ok(res.user);
                    assert.equal(res.user.testProp, "44");
                    done();
                });
            });
        });
    });
    describe("#delete", function () {
        it("should mark item as deleted and move to ${storeName}_deleted bucket", function (done) {
            $db.delete("AAAAAAAA-0000-0000-0000-000000000042", "users", (err) => {
                assert.equal(err, null);
                db.get("AAAAAAAA-0000-0000-0000-000000000042", "users_deleted", (err, item) => {
                    assert.equal(err, null);
                    assert.equal(item.testProp, "toDelete");
                    assert.ok(item._deleted);
                    done();
                });
            });
        });
        it("should return deleted item by _id and item should be marked as deleted", function (done) {
            $db.delete("AAAAAAAA-0000-0000-0000-000000000043", "users", (err) => {
                $db.get("AAAAAAAA-0000-0000-0000-000000000043", "users", (err, item) => {
                    assert.equal(err, null);
                    assert.equal(item.testProp, "toDelete2");
                    assert.ok(item._deleted);
                    done();
                });
            });
        });
        it("should return return error if willDelete hook return Promise that rejected", function (done) {
            $db.delete("AAAAAAAA-0000-0000-0000-000000000044", "users", (err) => {
                assert.notEqual(err, null);
                assert.equal(err.message, "NO_DELETE");
                $db.get("AAAAAAAA-0000-0000-0000-000000000044", "users", (err, item) => {
                    assert.equal(err, null);
                    assert.ok(!item._deleted);
                    done();
                });
            });
        });
    });
    describe("#nextSequence", function () {
        before(function (done) {
            db._dropCollection("_sequences", done);
        });
        it("should return next sequence number when first $db.nextSequence called", function (done) {
            $db.nextSequence("users", function (err, sequence) {
                assert.equal(err, null);
                assert.strictEqual(sequence, 1);
                $db.nextSequence("users", function (err, sequence) {
                    assert.equal(err, null);
                    assert.strictEqual(sequence, 2);
                    done();
                });
            });
        });
    });
    describe("#nextSequenceString", function () {
        before(function (done) {
            db._dropCollection("_sequences", done);
        });
        it("should return next sequence number when first $db.nextSequence called", function (done) {
            $db.nextSequenceString("users", function (err, sequence) {
                assert.equal(err, null);
                assert.strictEqual(sequence, "000001");
                $db.nextSequenceString("users", 3, function (err, sequence) {
                    assert.equal(err, null);
                    assert.strictEqual(sequence, "002");
                    done();
                });
            });
        });
    });
    describe("#notify", function() {
        beforeEach(function (done) {
            db._dropCollection("partialTestsNotificationStore", done);
        });
        it("should create documents in 'partialTestsNotificationStore' for all receivers when notify called", function(done){
            let receivers = [
                "AAAAAAAA-0000-0000-0000-000000000000",
                "AAAAAAAA-0000-0000-0000-000000000001",
            ];
            $db.notify(receivers, "partialTestsNotificationStore", "Hello", (e, res) => {
                assert.equal(e, null);
                $db.find({query: {}}, "partialTestsNotificationStore", (e, res) => {
                    console.log("NOTIFYING!!!", e, res);
                    assert.equal(e, null);
                    assert.notEqual(res, null);
                    assert.equal(res.count, 2);
                    assert.equal(res.items[0].message, "Hello");
                    assert.equal(res.items[0].event, "notification");
                    assert.equal(res.items[0].level, "info");
                    done();
                });
            });
        });
        it("should create documents in 'partialTestsNotificationStore' for one receiver passed as string when notify called", function(done){
            let receivers = "AAAAAAAA-0000-0000-0000-000000000000";
            $db.notify(receivers, "partialTestsNotificationStore", "Hello, receiver", (e, res) => {
                assert.equal(e, null);
                $db.find({query: {}}, "partialTestsNotificationStore", (e, res) => {
                    console.log("NOTIFYING!!! TWO", e, res);
                    assert.equal(e, null);
                    assert.notEqual(res, null);
                    assert.equal(res.count, 1);
                    assert.equal(res.items[0].message, "Hello, receiver");
                    assert.equal(res.items[0].event, "notification");
                    assert.equal(res.items[0].level, "info");
                    done();
                });
            });
        });

    });
    after(function () {
        db._dropCollection("users");
        db._dropCollection("users_deleted");
        db._dropCollection("partialTestsNotificationStore");
    });
});
