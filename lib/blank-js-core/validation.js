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

let valueComparableTypes = [_constants.propertyTypes.int, _constants.propertyTypes.float, _constants.propertyTypes.date],
    lengthComparableTypes = [_constants.propertyTypes.string, _constants.propertyTypes.password, _constants.propertyTypes.objectList],
    patternApplicableTypes = [_constants.propertyTypes.int, _constants.propertyTypes.float, _constants.propertyTypes.string, _constants.propertyTypes.password],
    maskApplicableTypes = [_constants.propertyTypes.string],
    nonValidatedTypes = [_constants.propertyTypes.virtual, _constants.propertyTypes.virtualRefList, _constants.propertyTypes.comments, _constants.propertyTypes.action];

function getValidationError(type, message, innerError, value) {
    let err = {
        "type": type
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

function validateType(type, value, propName) {
    let typeError = false;
    if (value == null) {
        return null;
    }
    switch (type) {
        case _constants.propertyTypes.int:
            typeError = isNaN(value) || value != parseInt(value, 10) || isNaN(parseInt(value, 10));
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
            typeError = typeof value !== "string";
            break;
        case _constants.propertyTypes.refList:
            typeError = !Array.isArray(value);
            if (!typeError) {
                for (let i = 0; i < value.length; i++) {
                    if (typeof value[i] !== "string") {
                        typeError = true;
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

function validateProperty(propsDesc, item, propName, baseItem, user) {
    let propDesc = propsDesc[propName],
        value = item[propName],
        errors = [];

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
    let typeError = validateType(propDesc.type, value, propName);
    if (typeError) {
        let message;
        if (typeof typeError === "string") {
            message = typeError;
        }
        errors.push(getValidationError(_constants.validityErrors.TYPE_ERROR, message, null, value));
    }

    //Inner object
    if (propDesc.type === _constants.propertyTypes.object && value != null) {
        let err = validation.validate(propDesc.props, value, item, user);
        if (err && Object.keys(err).length > 0) {
            errors.push(getValidationError(_constants.validityErrors.INNER_ERROR, null, err));
        }
    }
    if (propDesc.type === _constants.propertyTypes.objectList && Array.isArray(value)) {
        let listErrors = [],
            push = false;
        for (let i = 0; i < value.length; i++) {
            let err = validation.validate(propDesc.props, value[i], item, user);
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
        let validator = propDesc.required;
        if (validator.getValue(user, item, baseItem) && (value == null || value === "" || propDesc.type === _constants.propertyTypes.refList && value.length < 1)) {
            errors.push(getValidationError(validator.type, validator.message));
        }
    }

    //Min/max
    if (valueComparableTypes.indexOf(propDesc.type) >= 0 && value != null) {
        let valueToCompare = propDesc.type === _constants.propertyTypes.date ? new Date(value).valueOf() : value;

        if (propDesc.min != null) {
            let validator = propDesc.min;
            let min = validator.getValue(user, item, baseItem);
            min = propDesc.type === _constants.propertyTypes.date ? new Date(min).valueOf() : min;
            if (min != null && valueToCompare < min) {
                errors.push(getValidationError(validator.type, validator.message));
            }
        }

        if (propDesc.max != null) {
            let validator = propDesc.max;
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
            let validator = propDesc.minLength;
            minLength = validator.getValue(user, item, baseItem);

            if (minLength != null && (value || []).length < minLength) {
                err = getValidationError(validator.type, validator.message);
            }
        }

        if (propDesc.maxLength != null) {
            let validator = propDesc.maxLength;
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
        let validator = propDesc.pattern;
        let pattern = validator.getValue(user, item, baseItem);
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
            let validator = propDesc.mask;
            let mask = validator.getValue(user, item, baseItem);
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
        let validator = propDesc.expression;
        let expressionRes = validator.getValue(user, item, baseItem);
        if (!expressionRes) {
            errors.push(getValidationError(validator.type, validator.message));
        }
    }

    return errors.length > 0 ? errors : null;
}

class validation {
    static validate(propsDescs, item, baseItem, user) {
        let $invalidProps = {};
        let assignedItem = Object.assign({}, item, item.$changedProps);
        for (var propName of Object.keys(propsDescs)) {
            let err = validateProperty(propsDescs, assignedItem, propName, baseItem, user);
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
                    let innerErrors = Array.isArray(error.innerError) ? error.innerError : [error.innerError];
                    for (let i = 0; i < innerErrors.length; i++) {
                        let innerError = innerErrors[i];
                        validation.getPlainPropsNames(innerError, res, propName + "." + i + ".");
                    }
                }
                let name = (prefix || "") + propName;
                if (res.indexOf(name) < 0) {
                    res.push(name);
                }
            }
        }
        return res;
    }

    static getValidator(propDesc, validatorName, currentI18n) {
        let validatorDesc = propDesc[validatorName];
        if (validatorDesc == null || validatorDesc === "") {
            return null;
        }

        let validator = new Validator(_constants.baseValidators[validatorName].type, _constants.baseValidators[validatorName].message);
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
        let model = {
            "$i18n": currentI18n,
            "$validatorValue": validator.getValue()
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