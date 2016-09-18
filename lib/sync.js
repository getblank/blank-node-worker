let _connection, _resolve, _charged;
let _sequence = 0;
let _locked = {};
let _defer = createDefer();

function createDefer() {
    _charged = true;
    return new Promise((resolve) => {
        _resolve = resolve;
    });
}

module.exports.setup = function (connection) {
    _connection = connection;
    if (_connection != null) {
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
        _connection.call("sync.lock", () => {
            cb(unlock.bind(global, _lockId, id));
        }, id);
    });
    return d;
};

module.exports.once = function (id, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
    _connection.call("sync.once", (res, err) => { err || cb() }, id);
    return d;
};

function unlock(_lockId, id, cb) {
    if (!_locked[_lockId]) {
        throw new Error("Attempt to unlock no locked mutex");
    }
    delete _locked[_lockId];
    _defer.then(() => {
        _connection.call("sync.unlock", cb, id);
    });
}