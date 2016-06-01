"use strict";

var assert = require("assert");
var email = require("../lib/email");

var message = {
    to: "test@test.com",
    subject: "Test",
    body: "Test test",
};

describe("email", function () {
    it("should callback with error when first params no object", function (done) {
        email.send("test", (e) => {
            assert.notEqual(e, null);
            assert.equal(e.message, "WRONG MESSAGE");
            done();
        });
    });
    it("should callback with error when no found email settings", function (done) {
        email.send(message, (e) => {
            assert.notEqual(e, null);
            assert.equal(e.message, "Not found emailSettings in db");
            done();
        });
    });
});