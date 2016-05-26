"use strict";

import auth from "./auth";
import {clientStoreDef} from "./const";
import find from "utils/find";
import configProcessor from "configProcessor";

let _defaultStore = {
    "display": "none",
    "access": [
        { "role": "all", "permissions": "crud" },
        { "role": "guest", "permissions": "crud" },
    ],
};

let _propPrefixReg = new RegExp("\\$item."),
    _propReg = new RegExp("\\$item.([A-Za-z_][A-Za-z0-9_]*)", "g");

class ConfigStore {
    constructor() {
        this._config = null;
    }

    setup(config) {
        this._config = config;
        for (let storeName of Object.keys(this._config || {})) {
            let storeDesc = this._config[storeName];
            storeDesc.type = storeDesc.type || "directory";
            this.prepareProps(storeDesc.props);
        }
    }

    prepareProps(props) {
        for (let propName of Object.keys(props || {})) {
            let propDesc = props[propName];
            if (propDesc.type === "virtual" && typeof propDesc.load !== "function") {
                let script = propDesc.load || "return null;";
                propDesc.load = new Function("$item", "$baseItem", "require", script);
            }
            if (propDesc.props) {
                this.prepareProps(propDesc.props);
            }
        }
    }

    isReady() {
        return this._config != null;
    }

    isStore(storeName) {
        return this._config[storeName] != null;
    }

    isStoreAllowed(storeName, user) {
        let storeDesc = this._config[storeName];
        return storeDesc != null && auth.hasReadAccess(storeDesc.access, user);
    }

    getMongoAccessQuery(storeName, user) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null) {
            throw new Error("Invalid store");
        }
        return auth.computeMongoQuery(storeDesc.access, user);
    }

    getConfig(user) {
        let start = Date.now();
        if (user == null) {
            return this._config;
        }
        let res = {};

        for (let storeName of Object.keys(this._config)) {
            if (storeName === "_serverSettings") {
                continue;
            }
            let userStoreDesc = this.__getUserStoreDesc(storeName, user);
            if (userStoreDesc != null) {
                res[storeName] = userStoreDesc;
            }
        }
        console.log("User config ready in:", Date.now() - start);
        return res;
    }

    getProps(storeName, user) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null) {
            throw new Error("Invalid storeName");
        }
        if (user == null) {
            return storeDesc.props;
        }
        if (!auth.hasReadAccess(storeDesc.access, user) || storeDesc.type === "workspace") {
            throw new Error("Access to store denied");
        }
        return this.__getUserProps(storeDesc.props, user, this.__getUserWorkspace(user, storeName));
    }

    getLocale() {
        let cs = find.property(this, "_config._commonSettings.entries") || {};
        return cs.defaultLocale || (Array.isArray(cs.locales) && cs.locales[0]) || "en";
    }

    getPartialProps(storeName) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null) {
            throw new Error("Invalid storeName");
        }
        let res = {}, props = storeDesc.props || {};
        res._id = props._id;
        if (storeDesc.type === "notification") {
            return storeDesc.props;
        }
        if (storeDesc.type === "process") {
            res._state = props._state;
        }
        if (storeDesc.orderBy) {
            res[storeDesc.orderBy] = props[storeDesc.orderBy];
        }
        //HeaderTemplate and headerProp
        let propsFromHeaderTemplate = [];
        if (storeDesc.headerTemplate) {
            propsFromHeaderTemplate = this.__extractProps(storeDesc.headerTemplate || "");
        } else {
            let hProp = storeDesc.headerProperty || "name";
            res[hProp] = props[hProp];
        }
        //Labels
        let propsFromLabels = [];
        for (let label of (storeDesc.labels || [])) {
            let t = "" + label.text + label.icon + label.color + label.hidden;
            propsFromLabels = propsFromLabels.concat(this.__extractProps(t));
        }
        //Table columns
        let propsFromTableColumns = [];
        for (let tc of (storeDesc.tableColumns || [])) {
            if (typeof tc === "string") {
                propsFromTableColumns.push(tc);
            } else if (tc.prop) {
                propsFromTableColumns.push(tc.prop);
            }
        }
        //All together
        let p = [].concat(propsFromHeaderTemplate, propsFromLabels, propsFromTableColumns).reduce((prev, current) => {
            if (prev.indexOf(current) < 0) {
                prev.push(current);
            }
            return prev;
        }, []);
        for (let pName of p) {
            res[pName] = props[pName];
        }
        for (let pName of Object.keys(res)) {
            if (res[pName] == null) {
                console.warn("Property used in partial loading not found:", pName);
            }
        }
        return res;
    }

    getStoreDesc(storeName, user) {
        if (storeName) {
            if (storeName === "_") {
                return _defaultStore;
            }
            if (user) {
                return this.__getUserStoreDesc(storeName, user);
            }
            return (this._config || {})[storeName] || null;
        }
        return null;
    }

    getActionDesc(storeName, actionId) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null) {
            throw new Error("Store not found");
        }
        if (storeDesc._actionsCache == null) {
            storeDesc._actionsCache = {};
        }
        if (storeDesc._actionsCache[actionId]) {
            return storeDesc._actionsCache[actionId];
        }
        let res = this.__findAction(storeDesc, actionId);
        if (res == null) {
            throw new Error("Action not found");
        }
        try {
            res.script = new Function("$db", "require", "$user", "$item", "$data", res.script);
        } catch (e) {
            throw new Error(`${storeName} | ${actionId} | Error while compiling action script handler: ${e.message}`);
        }
        try {
            res.hidden = new Function("$user", "$item", res.hidden || "return false;");
        } catch (e) {
            throw new Error(`${storeName} | ${actionId} | Error while compiling action hidden handler: ${e.message}`);
        }
        try {
            res.disabled = new Function("$user", "$item", res.disabled || "return false;");
        } catch (e) {
            throw new Error(`${storeName} | ${actionId} | Error while compiling action disabled handler: ${e.message}`);
        }
        storeDesc._actionsCache[actionId] = res;
        return res;
    }

    getVirtualPropsLoaders(storeName) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null) {
            throw new Error("Store not found");
        }
        if (!storeDesc._virtualPropsLoadersCache) {
            storeDesc._virtualPropsLoadersCache = this.__getVirtualPropsLoaders(storeDesc.props || {});
        }
        return storeDesc._virtualPropsLoadersCache;
    }

    getTaskDesc(storeName, taskIndex) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null || !Array.isArray(storeDesc.tasks) || taskIndex > (storeDesc.tasks.length - 1)) {
            return null;
        }
        if (storeDesc._tasksCache == null) {
            storeDesc._tasksCache = [];
        }
        if (!storeDesc._tasksCache[taskIndex]) {
            let res = storeDesc.tasks[taskIndex];
            try {
                res.script = new Function("$db", "require", res.script);
            } catch (e) {
                throw new Error(`${storeName} | ${taskIndex} | Error while compiling scheduled task handler: ${e.message}`);
            }
            storeDesc._tasksCache[taskIndex] = res;
        }
        return storeDesc._tasksCache[taskIndex];
    }

    getHttpHookDesc(storeName, hookIndex) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null || !Array.isArray(storeDesc.httpHooks) || hookIndex > (storeDesc.httpHooks.length - 1)) {
            return null;
        }
        if (storeDesc._httpHooksCache == null) {
            storeDesc._httpHooksCache = [];
        }
        if (!storeDesc._httpHooksCache[hookIndex]) {
            let res = storeDesc.httpHooks[hookIndex];
            try {
                res.script = new Function("$db", "require", "$request", res.script);
            } catch (e) {
                throw new Error(`${storeName} | ${hookIndex} | Error while compiling httpHook handler: ${e.message}`);
            }
            storeDesc._httpHooksCache[hookIndex] = res;
        }
        return storeDesc._httpHooksCache[hookIndex];
    }

    getStoreEventHandler(storeName, event) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null || storeDesc.storeLifeCycle == null || storeDesc.storeLifeCycle[event] == null) {
            return null;
        }
        if (storeDesc._storeLifeCycleHandlerCache == null) {
            storeDesc._storeLifeCycleHandlerCache = {};
        }
        if (storeDesc._storeLifeCycleHandlerCache[event]) {
            return storeDesc._storeLifeCycleHandlerCache[event];
        }
        let handler;
        try {
            handler = new Function("$db", "require", storeDesc.storeLifeCycle[event]);
        } catch (e) {
            throw new Error(`${storeName} | ${event} | Error while compiling store event handler: ${e.message}`);
        }
        storeDesc._storeLifeCycleHandlerCache[event] = handler;
        return handler;
    }

    getItemEventHandler(storeName, event) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null || storeDesc.objectLifeCycle == null || storeDesc.objectLifeCycle[event] == null) {
            return null;
        }
        if (storeDesc._itemLifeCycleHandlerCache == null) {
            storeDesc._itemLifeCycleHandlerCache = {};
        }
        if (storeDesc._itemLifeCycleHandlerCache[event]) {
            return storeDesc._itemLifeCycleHandlerCache[event];
        }
        let handler;
        try {
            handler = new Function("$db", "require", "$user", "$item", "$prevItem", storeDesc.objectLifeCycle[event]);
        } catch (e) {
            throw new Error(`${storeName} | ${event} | Error while compiling item event handler: ${e.message}`);
        }
        storeDesc._itemLifeCycleHandlerCache[event] = handler;
        return handler;
    }

    getBaseItem(storeName, user) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null) {
            return {};
        }
        return configProcessor.getBaseItem(storeDesc, this.__getI18N(storeDesc.i18n), user);
    }

    getBaseConfig(lang) {
        let cs = JSON.parse(JSON.stringify(this._config["_commonSettings"]));
        cs.i18n = this.__getI18N(cs.i18n, lang);
        return {
            "_commonSettings": cs,
        };
    }

    __getUserStoreDesc(storeName, user) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null || !auth.hasReadAccess(storeDesc.access, user) || storeDesc.type === "workspace") {
            return null;
        }
        let res = {}, workspace = this.__getUserWorkspace(user);
        let wsStoreDesc = workspace && workspace[storeName];
        for (let p of Object.keys(clientStoreDef)) {
            res[p] = storeDesc[p];
            if (res[p] == null && clientStoreDef[p].default != null) {
                res[p] = clientStoreDef[p].default;
            }
            //Apply workspace base settings
            if (clientStoreDef[p].ws && wsStoreDesc && wsStoreDesc.hasOwnProperty(p)) {
                if (typeof clientStoreDef[p].ws === "function") {
                    res[p] = clientStoreDef[p].ws(res[p], wsStoreDesc[p]);
                } else {
                    res[p] = wsStoreDesc[p];
                }
            }
        }
        res.props = this.__getUserProps(storeDesc.props, user, wsStoreDesc);
        res.actions = this.__getUserActions(storeDesc.actions, user);
        res.storeActions = this.__getUserActions(storeDesc.storeActions, user);
        res.i18n = this.__getI18N(storeDesc.i18n, user.lang);
        res.groupAccess = res.ownerAccess = auth.computeAccess(storeDesc.access, user);
        return res;
    }

    __getUserWorkspace(user, storeName) {
        if (user.workspace && this._config[user.workspace]) {
            let workspace = this._config[user.workspace].config;
            if (storeName) {
                return workspace[storeName];
            }
            return workspace;
        }
        return null;
    }

    __getUserProps(props, user, wsDesc) {
        let res = {};
        for (let propName of Object.keys(props || {})) {
            let propDesc = props[propName];
            let access = auth.computeAccess(propDesc.access, user);
            if (access.indexOf("r") >= 0) {
                res[propName] = propDesc;
                res[propName].groupAccess = access;
                res[propName].ownerAccess = access;
                //Apply workspace props
                if (wsDesc && wsDesc.props && wsDesc.props[propName]) {
                    res[propName] = Object.assign({}, propDesc, wsDesc.props[propName]);
                }
            }
        }
        return res;
    }

    __getVirtualPropsLoaders(props) {
        let res = {};
        for (let propName of Object.keys(props)) {
            let propDesc = props[propName];
            if (propDesc.props) {
                res[propName] = this.__getVirtualPropsLoaders(propDesc.props);
                if (Object.keys(res[propName]).length < 1) {
                    delete res[propName];
                }
            }
            if (propDesc.type === "virtual") {
                res[propName] = propDesc.load;
            }
        }
        return res;
    }

    __getUserActions(actions, user) {
        //TODO: Tests needed!
        let res = [];
        for (let actionDesc of (actions || [])) {
            if (auth.hasReadAccess(actionDesc.access, user)) {
                let _actionDesc = {
                    "_id": actionDesc._id,
                    "clientPreScript": actionDesc.clientPreScript,
                    "clientPostScript": actionDesc.clientPostScript,
                    "hidden": actionDesc.hidden,
                    "disabled": actionDesc.disabled,
                    "label": actionDesc.label,
                    "formLabel": actionDesc.formLabel,
                    "icon": actionDesc.icon,
                    "hideInHeader": actionDesc.hideInHeader,
                    "disableItemReadyCheck": actionDesc.disableItemReadyCheck,
                    "groupAccess": auth.computeAccess(actionDesc.access, user),
                    "ownerAccess": auth.computeAccess(actionDesc.access, user),
                };
                if (actionDesc.props != null && Object.keys(actionDesc.props).length > 0) {
                    _actionDesc.props = this.__getUserProps(actionDesc.props, user);
                }
                res.push(_actionDesc);
            }
        }
        return res;
    }

    __findAction(storeDesc, actionId, __storeAction) {
        for (let actionDesc of (__storeAction ? storeDesc.storeActions : storeDesc.actions) || []) {
            if (actionDesc._id === actionId) {
                actionDesc.storeAction = !!__storeAction;
                return actionDesc;
            }
        }
        if (!__storeAction) {
            return this.__findAction(storeDesc, actionId, true);
        }
        return null;
    }

    __extractProps(val) {
        return (val.match(_propReg) || []).map(p => p.replace(_propPrefixReg, ""));
    }

    __getI18N(i18n, lang) {
        lang = lang || this.getLocale();
        return (i18n && i18n[lang]) || i18n;
    }
}

let store = new ConfigStore();
export default store;
module.exports = store;