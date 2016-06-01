"use strict";

let assert = require("assert");
let mutex = require("../lib/mutex");

describe("Mutext", function () {
    describe("#lock", function () {
        it("should call cb after module setup", function (done) {
            let _async = false;
            mutex.lock("1", () => {
                assert.equal(_async, true);
                done();
            });
            mutex.setup(
                (id, cb) => { cb() },
                (id, cb) => { cb() }
            );
            _async = true;
        });
    });
});

// describe("userScript")