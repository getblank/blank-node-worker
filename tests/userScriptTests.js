"use strict";

let assert = require("assert");
let userScript = require("../lib/userScript");
let JSZip = require("jszip");
var zip = new JSZip();

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
    describe("#require.registerZip", function () {
        before(function () {
            userScript.require.unregister();

            zip.file("one.js", "module.exports = \"one\"");
            let folder = zip.folder("two");
            folder.file("package.json", "{ \"main\": \"./two.js\" }");
            folder.file("two.js", "module.exports = \"two\"");
        });
        it("should register all modules from zip file", function (done) {
            zip.generateAsync({ type: "nodebuffer" }).then((buf) => {
                userScript.require.registerZip(buf, () => {
                    let one = userScript.require("one");
                    assert.equal(one, "one");
                    let two = userScript.require("two");
                    assert.equal(two, "two");
                    done();
                });
            });
        });
    });
    describe("#require.ensure", function () {
        it("should wait for module registration", function (done) {
            let _warn = console.warn,
                _info = console.info,
                _end = false,
                doneCount = 0;
            let d = () => {
                doneCount++;
                if (doneCount == 2) {
                    done();
                }
            };
            console.warn = function (test) {
                assert.equal(test, "42");
                assert.equal(_end, true);
                console.warn = _warn;
                d();
            };
            console.info = function (test) {
                assert.equal(test, "24");
                assert.equal(_end, true);
                console.info = _info;
                d();
            };
            userScript.require.register("moduleOne",
                `require.ensure("moduleTwo", () => {
                    console.warn(require("moduleTwo"));
                });
                require.ensure("moduleThree").then(() => {
                    console.info(require("moduleThree"));
                });
                module.exports.hello = "world"`);
            setTimeout(() => {
                userScript.require.register("moduleTwo", "module.exports = \"42\";");
                userScript.require.register("moduleThree", "module.exports = \"24\";");
            });
            userScript.require("moduleOne");
            _end = true;
        });
    });
});

// describe("userScript")