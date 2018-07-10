const _locked = {};
const _once = {};
let _connection;
let _resolve;
let _charged;
let _sequence = 0;

const createDefer = () => {
    _charged = true;
    return new Promise(resolve => {
        _resolve = resolve;
    });
};

let _defer = createDefer();

const setup = connection => {
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
    const d = typeof cb !== "function" ? new Promise(f => (cb = f)) : null;
    let _lockId = _sequence;
    _locked[_lockId] = true;
    _sequence++;
    _defer.then(() => {
        _connection.call(
            "sync.lock",
            () => {
                cb(unlock.bind(global, _lockId, id));
            },
            id
        );
    });
    return d;
};

const once = (id, cb) => {
    const d =
        typeof cb !== "function"
            ? new Promise((f, r) => (cb = (e, d) => setImmediate(() => (e != null ? r(e) : f(d)))))
            : null;
    _connection.call(
        "sync.once",
        (res, err) => {
            err || cb();
        },
        id
    );
    return d;
};

const unlock = (_lockId, id, cb = () =>{}) => {
    if (!_locked[_lockId]) {
        throw new Error("Attempt to unlock no locked mutex");
    }

    delete _locked[_lockId];
    _defer.then(() => {
        _connection.call("sync.unlock", cb, id);
    });
};

const queue = {};
const locks = {};

const checkWaiters = () => {
    for (const lockId of Object.keys(queue)) {
        const lockCallbacks = queue[lockId];
        if (lockCallbacks.length < 1) {
            delete queue[lockCallbacks];
        }

        if (!locks[lockId] && lockCallbacks.length > 0) {
            locks[lockId] = true;
            const cb = lockCallbacks.shift();

            return cb();
        }
    }
};

const localOnce = (id, cb) => {
    if (_once[id]) {
        return;
    }

    _once[id] = true;
    setTimeout(cb);
};

const localLock = (id, cb) => {
    if (!queue[id]) {
        queue[id] = [];
    }
    queue[id].push(cb);
    setTimeout(checkWaiters);
};

const localUnlock = (id, cb) => {
    delete locks[id];
    checkWaiters();
    if (typeof cb === "function") {
        setTimeout(() => {
            cb();
        });
    }
};

setup({
    call: (m, cb, id) => {
        switch (m) {
            case "sync.lock":
                return localLock(id, cb);
            case "sync.unlock":
                return localUnlock(id, cb);
            case "sync.once":
                return localOnce(id, cb);
        }
    },
});

module.exports = {
    lock,
    once,
    setup,
    unlock,
};
