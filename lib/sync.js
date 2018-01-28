const _locked = {};
let _connection;
let _resolve;
let _charged;
let _sequence = 0;

const createDefer = () => {
    _charged = true;
    return new Promise((resolve) => {
        _resolve = resolve;
    });
};

let _defer = createDefer();

const setup = (connection) => {
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

const lock = (id, cb) => {
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

const once = (id, cb) => {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
    _connection.call("sync.once", (res, err) => { err || cb() }, id);
    return d;
};

const unlock = (_lockId, id, cb) => {
    if (!_locked[_lockId]) {
        throw new Error("Attempt to unlock no locked mutex");
    }

    delete _locked[_lockId];
    _defer.then(() => {
        _connection.call("sync.unlock", cb, id);
    });
};

module.exports = {
    lock,
    once,
    setup,
    unlock,
};