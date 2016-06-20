"use strict";

var auth = require("./auth");
var {clientStoreDef} = require("./const");
var find = require("utils/find");
var configProcessor = require("configProcessor").default;
var userScript = require("./userScript");

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
                propDesc.load = userScript.create(script, `${propName}_load`, ["$item", "$baseItem"]);
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
        res.script = userScript.create(res.script,
            `${storeName}_${res.storeAction ? "storeActions" : "actions"}_${actionId}`,
            ["$user", "$item", "$data"]);
        res.hidden = userScript.create(res.hidden || "return false;",
            `${storeName}_${res.storeAction ? "storeActions" : "actions"}_${actionId}_hidden`,
            ["$user", "$item"]);
        res.disabled = userScript.create(res.disabled || "return false;",
            `${storeName}_${res.storeAction ? "storeActions" : "actions"}_${actionId}_disabled`,
            ["$user", "$item"]);
        storeDesc._actionsCache[actionId] = res;
        return res;
    }

    getStoreRefPairs(storeName) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null) {
            return null;
        }
        if (storeDesc._refPairsCache == null) {
            storeDesc._refPairsCache = [];
            let refs = this.__groupStoreRefsByStore(storeName);
            for (let oppositeStoreName of Object.keys(refs)) {
                let storeRefs = refs[oppositeStoreName];
                let oppositeStoreRefs = this.__groupStoreRefsByStore(oppositeStoreName)[storeName] || [];
                for (let ref of storeRefs) {
                    let oppositeRef;
                    if (storeRefs.length === 1 && oppositeStoreRefs.length === 1) {
                        oppositeRef = oppositeStoreRefs[0];
                    } else {
                        for (let oRef of oppositeStoreRefs) {
                            if (ref.oppositeProp === oRef.prop && ref.prop === oRef.oppositeProp) {
                                oppositeRef = oRef;
                                break;
                            }
                        }
                    }
                    if (oppositeRef) {
                        storeDesc._refPairsCache.push({
                            "ref": ref,
                            "oppositeRef": oppositeRef,
                            "oppositeStoreName": oppositeStoreName,
                        });
                    }
                }
            }
        }
        return storeDesc._refPairsCache;
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
            res.script = userScript.create(res.script, `${storeName}_task_${taskIndex}`);
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
            res.script = userScript.create(res.script, `${storeName}_HTTPHook_${hookIndex}`, ["$request"]);
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
        let handler = userScript.create(storeDesc.storeLifeCycle[event], `${storeName}_storeEvents_${event}`);
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
        let handler = userScript.create(storeDesc.objectLifeCycle[event], `${storeName}_itemEvents_${event}`, ["$user", "$item", "$prevItem"]);
        storeDesc._itemLifeCycleHandlerCache[event] = handler;
        return handler;
    }

    getBaseItem(storeName, user) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null) {
            return {};
        }
        let res = configProcessor.getBaseItem(storeDesc, this.__getI18N(storeDesc.i18n), user);
        res._ownerId = user._id;
        return res;
    }

    getBaseConfig(lang) {
        let cs = JSON.parse(JSON.stringify(this._config["_commonSettings"]));
        cs.i18n = this.__getI18N(cs.i18n, lang);
        return {
            "_commonSettings": cs,
        };
    }

    __groupStoreRefsByStore(storeName) {
        let storeDesc = this._config[storeName];
        if (storeDesc == null) {
            return {};
        }
        let refs = {};
        for (let propName of Object.keys(storeDesc.props || {})) {
            let propDesc = storeDesc.props[propName];
            if ((propDesc.type === "ref" || propDesc.type === "refList") && !propDesc.disableRefSync && propDesc.store) {
                refs[propDesc.store] = refs[propDesc.store] || [];
                refs[propDesc.store].push({
                    "prop": propName,
                    "type": propDesc.type,
                    "oppositeProp": propDesc.oppositeProp || null,
                });
            }
        }
        return refs;
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
        res.filters = this.__getComputedFilters(storeDesc.filters, storeName);
        res.i18n = this.__getI18N(storeDesc.i18n, user.lang);
        res.groupAccess = res.ownerAccess = auth.computeAccess(storeDesc.access, user);
        if (res.display === "single" || res.type === "single") {
            res.headerProperty = null;
        }
        return res;
    }

    __getComputedFilters(filters, storeName) {
        if (!filters) {
            return filters;
        }
        for (let i in filters) {
            let filter = filters[i];
            if (filter.query && typeof filter.query === "string") {
                filter.query = userScript.create(filter.query, `${storeName}_filters_${i}`, ["$value"]);
            }
        }
        return filters;
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
            if (propDesc.props) {
                propDesc.props = this.__getUserProps(propDesc.props, user);
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
                    "type": actionDesc.type,
                    "clientPreScript": actionDesc.clientPreScript,
                    "clientPostScript": actionDesc.clientPostScript,
                    "hidden": actionDesc.hidden,
                    "disabled": actionDesc.disabled,
                    "label": actionDesc.label,
                    "formLabel": actionDesc.formLabel,
                    "icon": actionDesc.icon,
                    "hideInHeader": actionDesc.hideInHeader,
                    "disableItemReadyCheck": actionDesc.disableItemReadyCheck,
                    "dynamicLabel": actionDesc.dynamicLabel,
                    "groupAccess": auth.computeAccess(actionDesc.access, user),
                    "ownerAccess": auth.computeAccess(actionDesc.access, user),
                };
                if (actionDesc.props != null && Object.keys(actionDesc.props).length > 0) {
                    _actionDesc.props = this.__getUserProps(actionDesc.props, user);
                }
                if (actionDesc.type === "client") {
                    _actionDesc.script = actionDesc.script;
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
module.exports = store;