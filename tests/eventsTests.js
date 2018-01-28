const assert = require("assert");
const matchQuery = require("../lib/db/events").matchQuery;

describe("#matchQuery", function () {
    const testData = [
        {
            document: { lastName: 43, name: "42", age: 42 },
            query: { name: "42" },
            result: true,
        },
        {
            document: { lastName: 43, name: "42", age: 42 },
            query: { age: { $gt: 30, $lt: 45 } },
            result: true,
        },

        {
            document: { lastName: 43, name: "42", age: 42 },
            query: { name: "43" },
            result: false,
        },
        {
            document: { lastName: 43, name: "42", age: 42 },
            query: { age: { $gt: 30, $lt: 35 } },
            result: false,
        },

        {
            document: { name: "42", createdAt: new Date(2018, 1, 28, 12, 5, 0, 0) },
            query: { name: "42", createdAt: new Date("2018-02-28T07:05:00.000Z") },
            result: true,
        },
        {
            document: { name: "42", createdAt: new Date(2018, 1, 28, 12, 5, 0, 0) },
            query: { name: "42", createdAt: { $gte: new Date("2018-02-28T07:05:00.000Z") } },
            result: true,
        },
        {
            document: { name: "42", createdAt: new Date(2018, 1, 28, 12, 5, 0, 0) },
            query: { name: "42", createdAt: { $gt: new Date("2018-02-28T07:05:00.000Z") } },
            result: false,
        },
        {
            document: { name: "42", createdAt: new Date(2018, 1, 28, 12, 5, 0, 0) },
            query: { name: "42", createdAt: { $gt: new Date("2018-02-28T07:04:00.000Z") } },
            result: true,
        },
    ];

    for (let i = 0; i < testData.length; i++) {
        const d = testData[i];
        const res = matchQuery(d.query, d.document);
        let message = `should return false when document not matched the query ${i}`;
        if (d.result) {
            message = `should return true when document matched the query ${i}`;
        }

        it(message, () => {
            assert.equal(res, d.result);
        });

    }

    it("should return true when no query provided, or query is empty", function () {
        assert.ok(matchQuery(null, { prop: "value" }) === true);
        assert.ok(matchQuery(undefined, { prop: "value" }) === true);
        assert.ok(matchQuery({}, { prop: "value" }) === true);
    });

    it("should return false when no document provided", function () {
        assert.ok(matchQuery({ name: "43" }, null) === false);
        assert.ok(matchQuery({ age: { $gt: 30, $lt: 35 } }, undefined) === false);
    });
});