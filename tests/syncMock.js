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

const lock = (id, cb) => {
    queue[id] = queue[id] || [];
    queue[id].push(cb);
    setTimeout(checkWaiters);
};

const unlock = (id, cb) => {
    delete locks[id];
    checkWaiters();
    if (typeof cb === "function") {
        setTimeout(() => {
            cb();
        });
    }
};

module.exports = {
    lock,
    unlock,
};