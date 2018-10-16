"use strict";

const assert = require("assert");
const sync = require("../lib/sync");

describe("SyncTest", function() {
    describe("#lock", function() {
        it("should call cb after module setup", function(done) {
            let _async = false;
            sync.lock("1", () => {
                assert.equal(_async, true);
                done();
            });
            sync.setup({
                call: (m, cb, id) => cb(),
            });
            _async = true;
        });

        it("should return unlock function", function(done) {
            sync.lock("1", unlock => {
                unlock();
            });
            sync.setup({
                call: (m, cb, id) => {
                    switch (m) {
                        case "sync.lock":
                            return cb();
                        case "sync.unlock":
                            assert.equal(id, "1");
                            done();
                            break;
                    }
                },
            });
        });

        it("should throws an error when unlock called more then one time", function(done) {
            sync.setup({
                call: (m, cb, id) => cb(),
            });
            sync.lock("2", unlock => {
                unlock();
                assert.throws(unlock, /Attempt to unlock no locked mutex/);
                done();
            });
        });
    });

    describe("#once", () => {
        it("should call without error only once", () => {
            const id = "1234567890";
            let calls = 0;
            return sync
                .once(id)
                .then(() => {
                    calls++;
                    return sync.once(id);
                })
                .then(() => {
                    calls++;
                })
                .catch(err => {})
                .then(() => {
                    assert.equal(calls, 1, "should be one");
                });
        });
    });
});
