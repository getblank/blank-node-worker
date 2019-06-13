"use strict";

var Enum = require("utils/enum");

module.exports.ipAddressRegex = new RegExp(
    "^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]).){3}([0-9]|[1-9][0-9]|1[0-9‌​]{2}|2[0-4][0-9]|25[0-5])(:d{1,5})?$"
);
module.exports.hostnameRegex = new RegExp(
    "^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]).)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$"
);

module.exports.taskUris = Enum("get", "done", "error");

module.exports.dbErrors = {
    storeNotFound: "Store not found",
    itemNotFound: "Not found",
};

module.exports.taskTypes = Enum(
    "authentication",
    "signup",
    "signOut",
    "didSignOut",
    "passwordResetRequest",
    "passwordReset",
    "userConfig",
    "dbGet",
    "dbSet",
    "dbInsert",
    "dbDelete",
    "dbFind",
    "dbPush",
    "dbLoadRefs",
    "action",
    "httpHook",
    "scheduledScript",
    "storeLifeCycle",
    "widgetData"
);

module.exports.clientStoreDef = {
    access: {},
    dataSource: {},
    disableAutoSelect: { ws: true, default: false },
    display: { ws: true, default: "list" },
    enableLiveSearch: { ws: true },
    enableSavingFilters: { ws: true },
    entries: {},
    itemsOnPage: { ws: true },
    filters: { ws: true },
    formGroups: { ws: true },
    formTabs: { ws: true },
    headerProperty: { ws: true },
    headerTemplate: { ws: true },
    hideHeader: { ws: true },
    hideQuickSearch: { ws: true },
    html: { ws: true },
    icon: { ws: true },
    label: { ws: true },
    labels: { default: [] },
    loadComponent: { ws: true },
    loadModule: { ws: true },
    logging: false,
    navGroup: { ws: true },
    navLabel: { ws: true },
    navOrder: { ws: true },
    orderBy: { ws: true },
    showFilters: { ws: true },
    states: {},
    tableColumns: { ws: true },
    template: {},
    type: {},
    widgets: { ws: true },

    // proccessed separately
    // "actions": [],
    // "i18n": {},
    // "props": {},
    // "storeActions": [],
};
