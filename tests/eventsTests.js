var assert = require("assert");
var matchQuery = require("../lib/db/events").matchQuery;

describe("#matchQuery", function () {
    let document = { lastName: 43, name: "42", age: 42 };
    it("should return true when document matched the query", function () {
        assert.ok(matchQuery({ name: "42" }, document) === true);
        assert.ok(matchQuery({ age: { $gt: 40, $lt: 45 } }, document) === true);
    });
    it("should return false when document not matched the query", function () {
        assert.ok(matchQuery({ name: "43" }, document) === false);
        assert.ok(matchQuery({ age: { $gt: 30, $lt: 35 } }, document) === false);
    });
    it("should return true when no query provided, or query is empty", function () {
        assert.ok(matchQuery(null, document) === true);
        assert.ok(matchQuery(undefined, document) === true);
        assert.ok(matchQuery({}, document) === true);
    });
    it("should return false when no document provided", function () {
        assert.ok(matchQuery({ name: "43" }, null) === false);
        assert.ok(matchQuery({ age: { $gt: 30, $lt: 35 } }, undefined) === false);
    });

});