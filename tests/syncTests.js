"use strict";

let assert = require("assert");
let sync = require("../lib/sync");

describe("SyncTest", function () {
    describe("#lock", function () {
        it("should call cb after module setup", function (done) {
            let _async = false;
            sync.lock("1", () => {
                assert.equal(_async, true);
                done();
            });
            sync.setup(
                (id, cb) => { cb() },
                (id, cb) => { cb() }
            );
            _async = true;
        });
        it("should return unlock function", function (done) {
            sync.lock("1", (unlock) => {
                unlock();
            });
            sync.setup(
                (id, cb) => { cb() },
                (id, cb) => {
                    assert.equal(id, "1");
                    done();
                }
            );
        });
        it("shuold throws an error when unlock called more then one time", function(done){
            sync.setup(
                (id, cb) => { cb() },
                (id, cb) => { cb() }
            );
            sync.lock("2", (unlock) => {
                unlock();
                assert.throws(unlock, /Attempt to unlock no locked mutex/);
                done();
            });
        });
    });
});