"use strict";

var Enum = require("utils/enum");

module.exports.ipAddressRegex = new RegExp("^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9‌​]{2}|2[0-4][0-9]|25[0-5])(:\d{1,5})?$");
module.exports.hostnameRegex = new RegExp("^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$");

module.exports.taskUris = Enum(
    "get",
    "done",
    "error"
);

module.exports.dbErrors = {
    "storeNotFound": "Store not found",
    "itemNotFound": "Not found",
};

module.exports.taskTypes = Enum(
    "authentication",
    "userConfig",
    "dbGet",
    "dbSet",
    "dbDelete",
    "dbFind",
    "dbPush",
    "action",
    "httpHook",
    "scheduledScript",
    "storeLifeCycle"
);

module.exports.clientStoreDef = {
    "type": {},
    "display": { "ws": true, "default": "list" },
    "access": {},
    "navGroup": { "ws": true },
    "navOrder": { "ws": true },
    "navLabel": { "ws": true },
    "label": { "ws": true },
    "orderBy": { "ws": true },
    "headerTemplate": { "ws": true },
    "headerProperty": { "ws": true },
    "icon": { "ws": true },
    "labels": { "default": [] },
    "filters": { "ws": true },
    "widgets": { "ws": true },
    "formGroupsOrder": { "ws": true },
    "formTabs": { "ws": true },
    "states": {},
    "entries": {},
    "html": { "ws": true },
    "tableColumns": { "ws": true },
    "disableAutoSelect": { "ws": true, "default": false },
    "template": {},
    // proccessed separately
    // "i18n": {},
    // "props": {},
    // "actions": [],
    // "storeActions": [],
};