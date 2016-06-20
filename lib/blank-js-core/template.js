"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _handlebars = require("handlebars");

var _handlebars2 = _interopRequireDefault(_handlebars);

var _moment = require("moment");

var _moment2 = _interopRequireDefault(_moment);

var _find = require("utils/find");

var _find2 = _interopRequireDefault(_find);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_handlebars2.default.registerHelper("moment", function (context, block) {
    if (context && context.hash) {
        block = JSON.parse(JSON.stringify(context));
        context = undefined;
    }
    var date = (0, _moment2.default)(context);

    //// Reset the language back to default before doing anything else
    //date.lang('en');

    for (var i in block.hash) {
        if (date[i]) {
            date = date[i](block.hash[i]);
        } else {
            console.log("moment.js does not support \"" + i + "\"");
        }
    }
    return date;
}); /**
     * Created by kib357 on 05/11/15.
     */

_handlebars2.default.registerHelper("i18n", function (context, block) {
    let res = _find2.default.property(block.data.root.$i18n, context);
    return res;
});

_handlebars2.default.registerHelper("round", function (context, block) {
    return Math.round(context);
});

_handlebars2.default.registerHelper("toFixed", function (context, decimals, block) {
    return parseFloat(context).toFixed(decimals || 2);
});

_handlebars2.default.registerHelper("ifEquals", function (v1, v2, options) {
    if (v1 === v2) {
        return options.fn(this);
    }
    return options.inverse(this);
});

_handlebars2.default.registerHelper("switch", function (value, options) {
    this._switch_value_ = value;
    var html = options.fn(this); // Process the body of the switch block
    delete this._switch_value_;
    return html;
});

_handlebars2.default.registerHelper("case", function (value, options) {
    if (value == this._switch_value_) {
        return options.fn(this);
    }
});

_handlebars2.default.registerHelper("or", function (value, options) {
    return value || options;
});

class TemplateEngine {
    static render(template, model, noEscape) {
        return _handlebars2.default.compile(template, { "noEscape": noEscape })(model);
    }

    static compile(template, noEscape) {
        return _handlebars2.default.compile(template, { "noEscape": noEscape });
    }
}
exports.default = TemplateEngine;