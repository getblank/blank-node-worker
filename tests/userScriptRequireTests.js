"use strict";

let assert = require("assert");
let userScriptRequire = require("../lib/userScriptRequire");

describe("UserScriptRequire", function () {
    describe("#register", function () {
        it("should add module that can be after required like commonJs module", function () {
            userScriptRequire.register("testModule", "localhost", "1234", "exports.fn = function () { return '42'; }; exports.init = ()=>{};");
            let testModule = userScriptRequire.require("testModule");
            assert.equal(testModule.fn(), "42");
        });
        it("should pass address and port to external module", function () {
            userScriptRequire.register("testModule", "localhost", "42", `
                let address, port;
                exports.fn = function () { return address + ":" + port; };
                exports.init = (a, p) => {address = a; port = p};`);
            let testModule = userScriptRequire.require("testModule");
            assert.equal(testModule.fn(), "localhost:42");
        });
    });
});
