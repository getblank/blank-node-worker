let _resolve, _defer, _charged, _connection;

function createDefer() {
    _charged = true;
    return new Promise((resolve) => {
        _resolve = resolve;
    });
}
_defer = createDefer();

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

module.exports.getItem = function (id, cb) {
    return _callLS("getItem", id, cb);
};

module.exports.setItem = function (id, data, cb) {
    return _callLS("setItem", id, data, cb);
};

module.exports.removeItem = function (id, cb) {
    return _callLS("removeItem", id, cb);
};

module.exports.clear = function (cb) {
    return _callLS("clear", cb);
};

function _callLS(method, id, data, cb) {
    if (typeof id === "function") {
        cb = id;
        id = null;
    }
    if (typeof data === "function") {
        cb = data;
        data = null;
    }
    let d;
    if (typeof cb !== "function") {
        d = new Promise(resolve => (cb = resolve));
    }
    _defer.then(() => {
        _connection.call(`localStorage.${method}`, cb, id, data);
    });
    return d;
}