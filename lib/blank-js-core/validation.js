/**
 * Created by kib357 on 16/01/16.
 */

"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _constants = require("./constants");

var _mask = require("mask");

var _mask2 = _interopRequireDefault(_mask);

var _template = require("template");

var _template2 = _interopRequireDefault(_template);

var _moment = require("moment");

var _moment2 = _interopRequireDefault(_moment);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Validator {
    constructor(type, message) {
        this.type = type;
        this.message = message;
    }
}

const valueComparableTypes = [_constants.propertyTypes.int, _constants.propertyTypes.float, _constants.propertyTypes.date];
const lengthComparableTypes = [_constants.propertyTypes.string, _constants.propertyTypes.password, _constants.propertyTypes.objectList];
const patternApplicableTypes = [_constants.propertyTypes.int, _constants.propertyTypes.float, _constants.propertyTypes.string, _constants.propertyTypes.password];
const maskApplicableTypes = [_constants.propertyTypes.string];
const nonValidatedTypes = [_constants.propertyTypes.virtual, _constants.propertyTypes.virtualRefList, _constants.propertyTypes.comments, _constants.propertyTypes.action];

function getValidationError(type, message, innerError, value) {
    const err = {
        type: type
    };
    if (message != null) {
        err.message = message;
    }
    if (innerError != null) {
        err.innerError = innerError;
    }
    if (value != null) {
        err.value = value;
        err.valueType = typeof value;
    }
    return err;
}

function isNotEmpty(value) {
    return value != null && value != "";
}

function validateType(storeName, propName, type, value, propDesc) {
    let typeError = false;
    if (value == null) {
        return null;
    }

    const isInt = value => isNaN(value) || value != parseInt(value, 10) || isNaN(parseInt(value, 10));

    switch (type) {
        case _constants.propertyTypes.int:
            if (propName === "_id" && value === `${ storeName }-new`) {
                return false;
            }

            typeError = isInt(value);
            //This check allows "" and null as valid integer
            //typeError = (n % 1 !== 0);
            break;
        case _constants.propertyTypes.float:
            {
                let v = value.toString().replace(",", ".");
                //See http://stackoverflow.com/questions/18082/validate-decimal-numbers-in-javascript-isnumeric?rq=1
                typeError = isNaN(parseFloat(v)) || !isFinite(v);
                break;
            }
        case _constants.propertyTypes.bool:
            typeError = typeof value !== "boolean";
            break;
        case _constants.propertyTypes.string:
            typeError = typeof value !== "string";
            break;
        case _constants.propertyTypes.password:
            typeError = typeof value !== "string" && typeof value !== "object" && (!value.key || !value.salt);
            break;
        case _constants.propertyTypes.date:
            typeError = (typeof value !== "string" || !value.match(_constants.iso8601)) && !(value instanceof Date);
            break;
        case _constants.propertyTypes.ref:
            switch (propDesc.refType) {
                case _constants.propertyTypes.string:
                    typeError = typeof value !== "string";
                    break;
                case _constants.propertyTypes.int:
                    typeError = isInt(value);
            }
            break;
        case _constants.propertyTypes.refList:
            typeError = !Array.isArray(value);
            if (!typeError) {
                for (let i = 0; i < value.length; i++) {
                    const val = value[i];
                    switch (propDesc.refType) {
                        case _constants.propertyTypes.string:
                            typeError = typeof val !== "string";
                            break;
                        case _constants.propertyTypes.int:
                            typeError = isInt(val);
                    }

                    if (typeError) {
                        return;
                    }
                }
            }
            break;
        case _constants.propertyTypes.object:
            typeError = typeof value !== "object";
            break;
        case _constants.propertyTypes.objectList:
            typeError = !Array.isArray(value);
            break;
        case _constants.propertyTypes.file:
        case _constants.propertyTypes.fileList:
            for (let upload of value || []) {
                if (upload.$uploadState === _constants.uploadStates.uploading) {
                    typeError = "Please wait while file upload ends"; //true;
                    break;
                }
            }
            break;
    }
    return typeError;
}

function validateProperty(storeName, propsDesc, item, propName, baseItem, user) {
    const propDesc = propsDesc[propName];
    const value = item[propName];
    const errors = [];

    if (nonValidatedTypes.indexOf(propDesc.type) >= 0) {
        return null;
    }

    //Check validators
    for (let validatorName of Object.keys(_constants.baseValidators)) {
        if (propDesc[validatorName] != null && !(propDesc[validatorName] instanceof Validator)) {
            propDesc[validatorName] = validation.getValidator(propDesc, validatorName, null);
        }
    }

    //Type casting
    const typeError = validateType(storeName, propName, propDesc.type, value, propDesc);
    if (typeError) {
        let message;
        if (typeof typeError === "string") {
            message = typeError;
        }
        errors.push(getValidationError(_constants.validityErrors.TYPE_ERROR, message, null, value));
    }

    //Inner object
    if (propDesc.type === _constants.propertyTypes.object && value != null) {
        const err = validation.validate(propDesc, value, item, user);
        if (err && Object.keys(err).length > 0) {
            errors.push(getValidationError(_constants.validityErrors.INNER_ERROR, null, err));
        }
    }

    if (propDesc.type === _constants.propertyTypes.objectList && Array.isArray(value)) {
        const listErrors = [];
        let push = false;
        for (let i = 0; i < value.length; i++) {
            const err = validation.validate(propDesc, value[i], item, user);
            listErrors.push(err);
            if (err && Object.keys(err).length > 0) {
                push = true;
            }
        }

        if (push) {
            errors.push(getValidationError(_constants.validityErrors.INNER_ERROR, null, listErrors));
        }
    }

    //Required
    if (propDesc.required != null) {
        const validator = propDesc.required;
        if (validator.getValue(user, item, baseItem) && (value == null || value === "" || propDesc.type === _constants.propertyTypes.refList && value.length < 1)) {
            errors.push(getValidationError(validator.type, validator.message));
        }
    }

    //Min/max
    if (valueComparableTypes.indexOf(propDesc.type) >= 0 && value != null) {
        const valueToCompare = propDesc.type === _constants.propertyTypes.date ? new Date(value).valueOf() : value;

        if (propDesc.min != null) {
            const validator = propDesc.min;
            let min = validator.getValue(user, item, baseItem);
            min = propDesc.type === _constants.propertyTypes.date ? new Date(min).valueOf() : min;
            if (min != null && valueToCompare < min) {
                errors.push(getValidationError(validator.type, validator.message));
            }
        }

        if (propDesc.max != null) {
            const validator = propDesc.max;
            let max = validator.getValue(user, item, baseItem);
            max = propDesc.type === _constants.propertyTypes.date ? new Date(max).valueOf() : max;
            if (max != null && valueToCompare > max) {
                errors.push(getValidationError(validator.type, validator.message));
            }
        }
    }

    //Min/max length
    //errorText = (value ? value.length : 0) + ' / ' + (field.minLength != null ? field.minLength + '-' : '') + (field.maxLength || 999999999);
    if (lengthComparableTypes.indexOf(propDesc.type) >= 0 && (value || []).length != 0) {
        let err, minLength, maxLength;
        if (propDesc.minLength != null) {
            const validator = propDesc.minLength;
            minLength = validator.getValue(user, item, baseItem);

            if (minLength != null && (value || []).length < minLength) {
                err = getValidationError(validator.type, validator.message);
            }
        }

        if (propDesc.maxLength != null) {
            const validator = propDesc.maxLength;
            maxLength = validator.getValue(user, item, baseItem);

            if (maxLength != null && (value || []).length > maxLength) {
                err = getValidationError(validator.type, validator.message);
            }
        }
        if (err) {
            if (!err.message) {
                err.message = (value ? value.length : 0) + " / " + (minLength != null ? minLength + " - " : "") + (maxLength || "&infin;");
            }
            errors.push(err);
        }
    }

    //Pattern
    if (isNotEmpty(value) && propDesc.pattern != null && patternApplicableTypes.indexOf(propDesc.type) >= 0) {
        const validator = propDesc.pattern;
        const pattern = validator.getValue(user, item, baseItem);
        if (pattern instanceof RegExp) {
            if (!pattern.test(value)) {
                errors.push(getValidationError(validator.type, validator.message));
            }
        } else {
            console.error("Invalid regexp returned for pattern. Property:", propName);
        }
    }

    //Mask
    if (isNotEmpty(value) && propDesc.mask != null) {
        if (maskApplicableTypes.indexOf(propDesc.type) >= 0) {
            const validator = propDesc.mask;
            const mask = validator.getValue(user, item, baseItem);
            if (mask) {
                let maskProcessor = new _mask2.default(mask);
                if (!maskProcessor.isValid(value)) {
                    errors.push(getValidationError(validator.type, validator.message));
                }
            }
        }
    }

    //Expression
    if (isNotEmpty(value) && propDesc.expression != null) {
        const validator = propDesc.expression;
        const expressionRes = validator.getValue(user, item, baseItem);
        if (!expressionRes) {
            errors.push(getValidationError(validator.type, validator.message));
        }
    }

    return errors.length > 0 ? errors : null;
}

class validation {
    static validate(storeDesc, item, baseItem, user) {
        const { props: propsDescs, name: storeName } = storeDesc;
        const $invalidProps = {};
        const assignedItem = Object.assign({}, item, item.$changedProps);
        for (let propName of Object.keys(propsDescs)) {
            const err = validateProperty(storeName, propsDescs, assignedItem, propName, baseItem, user);
            if (err) {
                $invalidProps[propName] = err;
            }
        }
        return $invalidProps;
    }

    static getPlainPropsNames(invalidProps, res, prefix) {
        res = res || [];
        for (let propName of Object.keys(invalidProps)) {
            for (let error of invalidProps[propName]) {
                if (error.type === _constants.validityErrors.INNER_ERROR) {
                    const innerErrors = Array.isArray(error.innerError) ? error.innerError : [error.innerError];
                    for (let i = 0; i < innerErrors.length; i++) {
                        const innerError = innerErrors[i];
                        validation.getPlainPropsNames(innerError, res, propName + "." + i + ".");
                    }
                }

                const name = (prefix || "") + propName;
                if (res.indexOf(name) < 0) {
                    res.push(name);
                }
            }
        }
        return res;
    }

    static getValidator(propDesc, validatorName, currentI18n) {
        const validatorDesc = propDesc[validatorName];
        if (validatorDesc == null || validatorDesc === "") {
            return null;
        }

        const validator = new Validator(_constants.baseValidators[validatorName].type, _constants.baseValidators[validatorName].message);
        if (typeof validatorDesc === "object") {
            validator.__expression = validatorDesc.expression;
            if (validatorDesc.message) {
                validator.message = validatorDesc.message;
            }
        } else {
            validator.__expression = validatorDesc;
        }
        if (typeof validator.__expression !== "string") {
            validator.__expression = JSON.stringify(validator.__expression);
        }

        try {
            validator.getValue = validation.__getValidatorFunction(validator.__expression);
        } catch (e) {
            switch (validatorName) {
                case "pattern":
                    {
                        let reg = new RegExp(validator.__expression);
                        validator.getValue = function () {
                            return reg;
                        };
                        break;
                    }
                case "mask":
                    validator.getValue = function () {
                        return validator.__expression;
                    };
                    break;
                default:
                    throw e;
            }
        }

        const model = {
            $i18n: currentI18n,
            $validatorValue: validator.getValue()
        };
        if (propDesc.type === _constants.propertyTypes.date && model.$validatorValue) {
            model.$validatorValue = (0, _moment2.default)(new Date(model.$validatorValue).toISOString()).format("L");
        }

        validator.message = _template2.default.render(validator.message || "", model);
        return validator;
    }

    static __getValidatorFunction(expression) {
        return new Function("$user", "$item", "$baseItem", `$user = $user || {}; $item = $item || {}; return ${ expression };`);
    }
}
exports.default = validation;