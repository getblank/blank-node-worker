"use strict";

let assert = require("assert");
let userScriptRequire = require("../lib/userScriptRequire");

describe("UserScriptRequire", function () {
    describe("#register", function () {
        it("should add module that can be after required like commonJs module", function () {
            userScriptRequire.register("testModule", "module.exports = function () { return '42'; };");
            let testModule = userScriptRequire.require("testModule");
            assert.equal(testModule(), "42");
        });
    });
});
