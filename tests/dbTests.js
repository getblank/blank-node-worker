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
                assert.equal(err, null, "returned error");
                assert.ok(item._id, "no '_id' in item");
                $db.get(item._id, "users", (err, $item) => {
                    assert.equal(err, null, "returned error");
                    assert.equal($item.name, "test");
                    done();
                });
            });
        });
    });
    after(function () {
        db._dropCollection("users");
    });
});
