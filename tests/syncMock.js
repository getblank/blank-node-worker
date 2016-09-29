let queue = {}, locks = {};

let checkWaiters = function () {
    for (let lockId of Object.keys(queue)) {
        let lockCallbacks = queue[lockId];
        if (!locks[lockId] && lockCallbacks.length > 0) {
            locks[lockId] = true;
            let cb = lockCallbacks.shift();
            cb();
        }
        if (lockCallbacks.length < 1) {
            delete queue[lockCallbacks];
        }
    }
};

module.exports.lock = function (id, cb) {
    if (!queue[id]) {
        queue[id] = [];
    }
    queue[id].push(cb);
    setTimeout(checkWaiters);
};

module.exports.unlock = function (id, cb) {
    delete locks[id];
    checkWaiters();
    if (typeof cb === "function") {
        setTimeout(() => {
            cb();
        });
    }
};