let queue = {}, locks = {};

let checkWaters = function () {
    for (let lockId of Object.keys(queue)) {
        let lockCallbacks = queue[lockId];
        if (!locks[lockId]) {
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
    setTimeout(checkWaters);
};

module.exports.unlock = function (id, cb) {
    delete locks[id];
    checkWaters();
    if (typeof cb === "function") {
        setTimeout(() => {
            cb();
        });
    }
};