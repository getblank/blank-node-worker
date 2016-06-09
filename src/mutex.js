let _lock, _unlock, _resolve, _defer, _charged;

function createDefer() {
    _charged = true;
    return new Promise((resolve) => {
        _resolve = resolve;
    });
}
_defer = createDefer();

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
    let d = (typeof cb !== "function") ? new Promise(resolve => (cb = resolve)) : null;
    _defer.then(() => {
        _lock(id, () => {
            cb(unlock.bind(global, id));
        });
    });
    return d;
};

function unlock(id, cb) {
    _defer.then(() => {
        _unlock(id, cb);
    });
}