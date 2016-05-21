"use strict";

import Enum from "utils/enum";

export const ipAddressRegex = new RegExp("^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9‌​]{2}|2[0-4][0-9]|25[0-5])(:\d{1,5})?$");
export const hostnameRegex = new RegExp("^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$");

export const taskUris = Enum(
    "get",
    "done",
    "error"
);

export const taskTypes = Enum(
    // "test",
    "authentication",
    "userConfig",
    "dbGet",
    "dbSet",
    "dbDelete",
    "dbFind",
    "action",
    "httpHook",
    "scheduledScript"
);

export const clientStoreDef = {
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
    "labels": {"default": []},
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