let _lock, _unlock, _once, _resolve, _charged;
let _sequence = 0;
let _locked = {};
let _defer = createDefer();

function createDefer() {
    _charged = true;
    return new Promise((resolve) => {
        _resolve = resolve;
    });
}

module.exports.setup = function (lockFn, unlockFn, onceFn) {
    _lock = lockFn;
    _unlock = unlockFn;
    _once = onceFn;
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
    let d = (typeof cb !== "function") ? new Promise(f => cb = f) : null;
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

module.exports.once = function (id, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => e != null ? r(e) : f(d))) : null;
    _once(id, (res, err) => err || cb());
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