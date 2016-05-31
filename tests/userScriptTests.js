"use strict";

let assert = require("assert");
let userScript = require("../lib/userScript");

describe("UserScript", function () {
    describe("#require.register", function () {
        it("should add module that can be after required like commonJs module", function () {
            userScript.require.register("testModule",
                "exports.fn = function () { return '42'; }; exports.init = ()=>{};",
                "localhost",
                "1234");
            let testModule = userScript.require("testModule");
            assert.equal(testModule.fn(), "42");
        });
        it("should pass address and port to external module", function () {
            userScript.require.register("testModuleWithAddress",
                `let address, port;
                exports.fn = function () { return address + ":" + port; };
                exports.init = (a, p) => {address = a; port = p};`,
                "localhost",
                "42");
            let testModule = userScript.require("testModuleWithAddress");
            assert.equal(testModule.fn(), "localhost:42");
        });
    });
    describe("#require.ensure", function () {
        it("should wait for module registration", function (done) {
            let _log = console.log,
                _end = false;
            console.log = function (test) {
                assert.equal(test, "42");
                assert.equal(_end, true);
                console.log = _log;
                done();
            };
            userScript.require.register("moduleOne",
                `require.ensure("moduleTwo", () => {
                    console.log(require("moduleTwo"));
                });`);
            setTimeout(() => {
                userScript.require.register("moduleTwo", "module.exports = \"42\";");
            });
            _end = true;
        });
    });
});

// describe("userScript")