"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true,
});
exports.baseValidators = exports.validityErrors = exports.uploadStates = exports.lsKeys = exports.defaultRoles = exports.conditionOperators = exports.systemStores = exports.storeEvents = exports.userPreferences = exports.userActions = exports.serverActions = exports.displayTypes = exports.storeDisplayTypes = exports.widgetTypes = exports.propertyTypes = exports.storeTypes = exports.processStates = exports.itemStates = exports.previewMinWidth = exports.actionsBaseUrl = exports.iso8601 = undefined;

var _enum = require("utils/enum");

var _enum2 = _interopRequireDefault(_enum);

function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
}

const iso8601 = (exports.iso8601 = /^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d/);
/**
 * Created by kib357 on 23/07/15.
 */

const actionsBaseUrl = (exports.actionsBaseUrl = "/actions/");

const previewMinWidth = (exports.previewMinWidth = 740);

const itemStates = (exports.itemStates = (0, _enum2.default)(
    "ready",
    "modified",
    "saving",
    "new",
    "loading",
    "notFound",
    "notMatchFilter",
    "moved",
    "deleted",
    "deleting",
    "error"
));

const processStates = (exports.processStates = (0, _enum2.default)("_archive"));

const storeTypes = (exports.storeTypes = (0, _enum2.default)(
    "single",
    "directory",
    "process",
    "map",
    "notification",
    "workspace"
));

const propertyTypes = (exports.propertyTypes = (0, _enum2.default)(
    "int",
    "float",
    "bool",
    "string",
    "password",
    "date",
    "dateOnly",
    "ref",
    "refList",
    "virtual",
    "virtualRefList",
    "comments",
    "object",
    "objectList",
    "action",
    "file",
    "fileList",
    "widget",
    "uuid"
));

const widgetTypes = (exports.widgetTypes = {
    chartNvD3: "chart/nvd3",
});

const storeDisplayTypes = (exports.storeDisplayTypes = (0, _enum2.default)(
    "grid",
    "table",
    "list",
    "html",
    "single",
    "dashboard",
    "none"
));

const displayTypes = (exports.displayTypes = (0, _enum2.default)(
    "audio",
    "autocomplete",
    "text",
    "textInput",
    "numberInput",
    "floatInput",
    "textArea",
    "checkbox",
    "radio",
    "searchBox",
    "dataTable",
    "checkList",
    "select",
    "datePicker",
    "dateRange",
    "numberRange",
    "timePicker",
    "dateTimePicker",
    "colorPicker",
    "filePicker",
    "masked",
    "password",
    "headerInput",
    "newUsernameInput",
    "code",
    "codeEditor",
    "link",
    "html",
    "form",
    "react",
    "none"
));

const serverActions = (exports.serverActions = (0, _enum2.default)(
    "CONNECTED_EVENT",
    "DISCONNECTED_EVENT",
    //
    "SUBSCRIBED",
    "UNSUBSCRIBED",
    "UPDATE_CONFIG",
    "UPDATE_SERVER_STATE",
    "UPDATE_USER",
    "NOTIFICATIONS_UPDATE",
    "NOTIFICATIONS_INIT",
    "ITEMS_UPDATED",
    "ITEMS_PART_LOADED",
    "ITEM_LOAD_2",
    "ITEM_SAVE_RESPONSE",
    "ITEM_DELETE_RESPONSE",
    "ITEM_ACTION_RESPONSE",
    "STORE_ACTION_RESPONSE",
    "SIGN_IN",
    "SIGN_OUT",
    "SIGN_UP",
    "SEARCH_LOAD_RESULT",
    "SEARCH_LOAD_ERROR",
    "FILE_UPLOAD_RESPONSE"
));

const userActions = (exports.userActions = (0, _enum2.default)(
    "ROUTE_CHANGE",
    "ITEM_LOCK",
    "SET_PREFERENCE",
    "NOTIFICATIONS_HIGHLIGHT",
    "ITEM_CREATE",
    "ITEM_SAVE_DRAFT",
    "ITEM_SAVE",
    "ITEM_DELETE",
    "ITEM_LOAD",
    "AUDIO_PLAY",
    "AUDIO_STOP",
    "AUDIO_PAUSE",
    "SET_ORDER",
    "SET_FILTER",
    "CLEAR_FILTER",
    "ITEM_SAVE_REQUEST",
    "ITEM_DELETE_REQUEST",
    "ITEM_ACTION_REQUEST",
    "STORE_ACTION_REQUEST",
    "LOAD_ITEMS",
    "SEARCH_LOAD_CALL",
    "FILE_UPLOAD_NEW",
    "FILE_UPLOAD_CANCEL",
    "ACTION_SAVE_DRAFT",
    "ACTION_SELECT"
));

const userPreferences = (exports.userPreferences = (0, _enum2.default)("SHOW_NOTIFICATIONS"));

const storeEvents = (exports.storeEvents = (0, _enum2.default)("CHANGED"));

const systemStores = (exports.systemStores = {
    users: "users",
    profile: "_nav",
    settings: "_commonSettings",
});

const conditionOperators = (exports.conditionOperators = (0, _enum2.default)("notContains"));

const defaultRoles = (exports.defaultRoles = {
    root: "00000000-0000-0000-0000-000000000000",
    owner: "11111111-1111-1111-1111-111111111111",
});

const lsKeys = (exports.lsKeys = {
    locale: "-locale-",
});

const uploadStates = (exports.uploadStates = (0, _enum2.default)("uploading", "aborting", "ready", "error"));

const validityErrors = (exports.validityErrors = (0, _enum2.default)(
    "INNER_ERROR",
    "TYPE_ERROR",
    "REQUIRED",
    "MIN",
    "MAX",
    "MIN_LENGTH",
    "MAX_LENGTH",
    "PATTERN",
    "MASK",
    "EXPRESSION"
));

const baseValidators = (exports.baseValidators = {
    required: {
        type: validityErrors.REQUIRED,
        message: "{{$i18n.$settings.errors.requiredField}}",
    },
    min: {
        type: validityErrors.MIN,
        message: ">= {{$validatorValue}}",
    },
    max: {
        type: validityErrors.MAX,
        message: "<= {{$validatorValue}}",
    },
    minLength: {
        type: validityErrors.MIN_LENGTH,
    },
    maxLength: {
        type: validityErrors.MAX_LENGTH,
    },
    pattern: {
        type: validityErrors.PATTERN,
        message: "{{$i18n.$settings.errors.invalidPattern}}",
    },
    mask: {
        type: validityErrors.MASK,
        message: "{{$i18n.$settings.errors.invalidPattern}}",
    },
    expression: {
        type: validityErrors.EXPRESSION,
        message: "{{$i18n.$settings.errors.invalidPattern}}",
    },
});
