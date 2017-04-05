/**
 * Created by kib357 on 16/01/16.
 */

"use strict";

import { validityErrors, baseValidators, propertyTypes, iso8601, uploadStates } from "./constants";
import Mask from "mask";
import template from "template";
import moment from "moment";

class Validator {
    constructor(type, message) {
        this.type = type;
        this.message = message;
    }
}

const valueComparableTypes = [
    propertyTypes.int,
    propertyTypes.float,
    propertyTypes.date,
];
const lengthComparableTypes = [
    propertyTypes.string,
    propertyTypes.password,
    propertyTypes.objectList,
];
const patternApplicableTypes = [
    propertyTypes.int,
    propertyTypes.float,
    propertyTypes.string,
    propertyTypes.password,
];
const maskApplicableTypes = [
    propertyTypes.string,
];
const nonValidatedTypes = [
    propertyTypes.virtual,
    propertyTypes.virtualRefList,
    propertyTypes.comments,
    propertyTypes.action,
];

function getValidationError(type, message, innerError, value) {
    const err = {
        type: type,
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

    const isInt = (value) => isNaN(value) || value != parseInt(value, 10) || isNaN(parseInt(value, 10));

    switch (type) {
        case propertyTypes.int:
            if (propName === "_id" && value === `${storeName}-new`) {
                return false;
            }

            typeError = isInt(value);
            //This check allows "" and null as valid integer
            //typeError = (n % 1 !== 0);
            break;
        case propertyTypes.float: {
            let v = value.toString().replace(",", ".");
            //See http://stackoverflow.com/questions/18082/validate-decimal-numbers-in-javascript-isnumeric?rq=1
            typeError = isNaN(parseFloat(v)) || !isFinite(v);
            break;
        }
        case propertyTypes.bool:
            typeError = typeof value !== "boolean";
            break;
        case propertyTypes.string:
        case propertyTypes.password:
            typeError = typeof value !== "string";
            break;
        case propertyTypes.date:
            typeError = (typeof value !== "string" || !value.match(iso8601)) && !(value instanceof Date);
            break;
        case propertyTypes.ref:
            switch (propDesc.refType) {
                case propertyTypes.string:
                    typeError = typeof value !== "string";
                    break;
                case propertyTypes.int:
                    typeError = isInt(value);
            }
            break;
        case propertyTypes.refList:
            typeError = !Array.isArray(value);
            if (!typeError) {
                for (let i = 0; i < value.length; i++) {
                    const val = value[i];
                    switch (propDesc.refType) {
                        case propertyTypes.string:
                            typeError = typeof val !== "string";
                            break;
                        case propertyTypes.int:
                            typeError = isInt(val);
                    }

                    if (typeError) {
                        return;
                    }
                }
            }
            break;
        case propertyTypes.object:
            typeError = typeof value !== "object";
            break;
        case propertyTypes.objectList:
            typeError = !Array.isArray(value);
            break;
        case propertyTypes.file:
        case propertyTypes.fileList:
            for (let upload of (value || [])) {
                if (upload.$uploadState === uploadStates.uploading) {
                    typeError = "Please wait while file upload ends";//true;
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
    for (let validatorName of Object.keys(baseValidators)) {
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
        errors.push(getValidationError(validityErrors.TYPE_ERROR, message, null, value));
    }

    //Inner object
    if (propDesc.type === propertyTypes.object && value != null) {
        const err = validation.validate(propDesc, value, item, user);
        if (err && Object.keys(err).length > 0) {
            errors.push(getValidationError(validityErrors.INNER_ERROR, null, err));
        }
    }

    if (propDesc.type === propertyTypes.objectList && Array.isArray(value)) {
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
            errors.push(getValidationError(validityErrors.INNER_ERROR, null, listErrors));
        }
    }

    //Required
    if (propDesc.required != null) {
        const validator = propDesc.required;
        if (validator.getValue(user, item, baseItem) &&
            (value == null || value === "" || (propDesc.type === propertyTypes.refList && value.length < 1))) {
            errors.push(getValidationError(validator.type, validator.message));
        }
    }

    //Min/max
    if ((valueComparableTypes.indexOf(propDesc.type) >= 0) && (value != null)) {
        const valueToCompare = propDesc.type === propertyTypes.date ? new Date(value).valueOf() : value;

        if (propDesc.min != null) {
            const validator = propDesc.min;
            let min = validator.getValue(user, item, baseItem);
            min = propDesc.type === propertyTypes.date ? new Date(min).valueOf() : min;
            if (min != null && valueToCompare < min) {
                errors.push(getValidationError(validator.type, validator.message));
            }
        }

        if (propDesc.max != null) {
            const validator = propDesc.max;
            let max = validator.getValue(user, item, baseItem);
            max = propDesc.type === propertyTypes.date ? new Date(max).valueOf() : max;
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
    if (isNotEmpty(value) &&
        propDesc.pattern != null &&
        patternApplicableTypes.indexOf(propDesc.type) >= 0) {
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
                let maskProcessor = new Mask(mask);
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

export default class validation {
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
                if (error.type === validityErrors.INNER_ERROR) {
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

        const validator = new Validator(baseValidators[validatorName].type, baseValidators[validatorName].message);
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
                case "pattern": {
                    let reg = new RegExp(validator.__expression);
                    validator.getValue = function () { return reg };
                    break;
                }
                case "mask":
                    validator.getValue = function () { return validator.__expression };
                    break;
                default:
                    throw e;
            }
        }

        const model = {
            $i18n: currentI18n,
            $validatorValue: validator.getValue(),
        };
        if (propDesc.type === propertyTypes.date && model.$validatorValue) {
            model.$validatorValue = moment((new Date(model.$validatorValue)).toISOString()).format("L");
        }

        validator.message = template.render(validator.message || "", model);
        return validator;
    }

    static __getValidatorFunction(expression) {
        return new Function("$user", "$item", "$baseItem", `$user = $user || {}; $item = $item || {}; return ${expression};`);
    }
}