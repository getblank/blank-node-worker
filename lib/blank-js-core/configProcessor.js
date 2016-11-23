'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _constants = require('constants');

var _template = require('template');

var _template2 = _interopRequireDefault(_template);

var _nodeUuid = require('uuid');

var _nodeUuid2 = _interopRequireDefault(_nodeUuid);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class configProcessor {
    static getBaseItem(storeDesc, currentI18n, currentUser, item) {
        let res = { "_id": _nodeUuid2.default.v4() };
        if (storeDesc && storeDesc.props) {
            for (let prop of Object.keys(storeDesc.props)) {
                if (storeDesc.props[prop].default != null) {
                    let defaultValue = storeDesc.props[prop].default;

                    if (typeof defaultValue === 'string') {
                        defaultValue = _template2.default.render(defaultValue, {
                            "$i18n": currentI18n,
                            "$user": currentUser,
                            "$item": item || {}
                        });
                    }
                    res[prop] = defaultValue;
                }
            }
        }
        return res;
    }
}
exports.default = configProcessor;