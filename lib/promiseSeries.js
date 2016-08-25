Promise.series = function (array, stop = () => false) {
    return new Promise(function (resolve, reject) {
        var i = 0;
        var len = array.length;
        var results = [];

        function promiseHandler(result) {
            results[i] = result;
            if (stop(result)) {
                return resolve(results);
            }
            i++;
            next();
        }

        function next() {
            if (i >= len) {
                return resolve(results);
            }

            var method = array[i];
            if (typeof method !== "function") {
                return promiseHandler(method);
            }

            var p = method();
            if (typeof p.then === "function" && typeof p.catch === "function") {
                p.then(promiseHandler).catch(reject);
            } else {
                promiseHandler(p);
            }
        }

        next();
    });
};
