"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _constants = require("constants");

var _compare = function (a, b, field) {
    var valueA = a[field] ? a[field].valueOf() : null;
    var valueB = b[field] ? b[field].valueOf() : null;
    if (_constants.iso8601.test(valueA) || _constants.iso8601.test(valueB)) {
        valueA = a[field] ? new Date(a[field]).valueOf() : null;
        valueB = b[field] ? new Date(b[field]).valueOf() : null;
    }
    if (valueA == valueB) {
        if (a._id > b._id) {
            return 1;
        }
        return -1;
    }
    if (valueA > valueB) {
        return 1;
    }
    return -1;
}; /**
    * Created by kib357 on 03/07/15.
    */

var _by = function (items, field, desc) {
    return items.sort(function (a, b) {
        return desc ? _compare(b, a, field) : _compare(a, b, field);
    });
};

exports.default = {
    "by": _by,
    "compare": _compare
};