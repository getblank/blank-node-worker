"use strict";

var assert = require("assert");
var email = require("../lib/email");

var message = {
    to: "test@test.com",
    subject: "Test",
    body: "Test test",
    test: true,
};

describe("email", function() {
    it("should callback with error when first params no object", () => {
        return email
            .send("test")
            .then(() => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.notEqual(err, null);
                assert.equal(err.message, "message must be an object");
            });
    });
    it("should callback with error when no found email settings", () => {
        return email
            .send(message)
            .then(() => {
                throw new Error("should not resolve");
            })
            .catch(err => {
                assert.notEqual(err, null);
                assert.equal(err.message, "Not found emailSettings in db");
            });
    });
});
