"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _find = require("utils/find");

var _find2 = _interopRequireDefault(_find);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ESCAPE_LOOKUP = {
    "&": "&amp;",
    ">": "&gt;",
    "<": "&lt;",
    "\"": "&quot;",
    "'": "&#x27;"
}; /**
    * Created by kib357 on 24/09/15.
    */

var ESCAPE_REGEX = /[&><"']/g;

function escaper(match) {
    return ESCAPE_LOOKUP[match];
}

class mustaches {
    static shave(text, dataMap, noSanitize) {
        text = text || "";
        var matches = text.match(/{.+?}/g);
        for (let match of matches || []) {
            var property = match.substring(1, match.length - 1);
            var value = _find2.default.propertyValue(property, dataMap);
            if (value == null) {
                value = "?";
            }
            if (!noSanitize) {
                value = ("" + value).replace(ESCAPE_REGEX, escaper);
            }
            text = text.replace(new RegExp(_find2.default.escapeRegExp(match)), value);
        }
        return text;
    }
}
exports.default = mustaches;