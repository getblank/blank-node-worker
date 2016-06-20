let _lock, _unlock, _resolve, _charged;
let _sequence = 0;
let _locked = {};
let _defer = createDefer();

function createDefer() {
    _charged = true;
    return new Promise((resolve) => {
        _resolve = resolve;
    });
}

module.exports.setup = function (lockFn, unlockFn) {
    _lock = lockFn;
    _unlock = unlockFn;
    if (typeof _lock === "function" && typeof _unlock === "function") {
        _charged = false;
        _resolve();
    } else {
        if (!_charged) {
            _defer = createDefer();
        }
    }
};

module.exports.lock = function (id, cb) {
    let d;
    if (typeof cb !== "function") {
        d = new Promise(resolve => (cb = resolve));
    }
    let _lockId = _sequence;
    _locked[_lockId] = true;
    _sequence++;
    _defer.then(() => {
        _lock(id, () => {
            cb(unlock.bind(global, _lockId, id));
        });
    });
    return d;
};

function unlock(_lockId, id, cb) {
    if (!_locked[_lockId]) {
        throw new Error("Attempt to unlock no locked mutex");
    }
    delete _locked[_lockId];
    _defer.then(() => {
        _unlock(id, cb);
    });
}