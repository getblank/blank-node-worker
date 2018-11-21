"use strict";

const auth = require("./auth");
const { clientStoreDef } = require("./const");
const find = require("utils/find");
const configProcessor = require("configProcessor").default;
const userScript = require("./userScript");
const cloneDeep = require("lodash.clonedeep");

const _defaultStore = {
    display: "none",
    access: [{ role: "all", permissions: "vcrudx" }, { role: "guest", permissions: "vcrudx" }],
};

const _propPrefixReg = new RegExp("\\$item.");
const _propReg = new RegExp("\\$item.([A-Za-z_][A-Za-z0-9_]*)", "g");

class ConfigStore {
    constructor() {
        this._config = null;
        this._i18n = {};
    }

    async setup(config) {
        this._config = config;
        this._i18n = {};

        const allLocales = this.getAllLocales();
        const defaultLocale = this.getLocale();
        allLocales.forEach(l => (this._i18n[l] = {}));

        if (!this._config) {
            return;
        }

        for (const storeName of Object.keys(this._config || {})) {
            const storeDesc = this._config[storeName];
            storeDesc.name = storeName;
            storeDesc.type = storeDesc.type || "directory";
            await this.prepareProps(storeDesc.props, storeName, storeDesc);
            if (storeDesc.i18n != null) {
                for (let l of allLocales) {
                    let res = storeDesc.i18n[l] || null;
                    if (res == null && l === defaultLocale) {
                        res = storeDesc.i18n;
                    }
                    this._i18n[l][storeName] = res;
                }
            }

            const { dataSource } = storeDesc;
            if (dataSource) {
                if (dataSource.type) {
                    if (dataSource.type !== "file") {
                        throw new Error(`Unknown dataSource.type "${dataSource.type}", only "file" is supported`);
                    }

                    if (!dataSource.file) {
                        throw new Error(`dataSource.file is not provided for store ${storeName}`);
                    }
                } else {
                    storeDesc.dataSource = null;
                }
            }
        }

        this.prepareAuthLifeCycle();
        this.fillAppTitle();
    }

    fillAppTitle() {
        if (!this._config["_commonSettings"]) {
            console.error("[fillAppTitle] _commonSettings does not exist in config");
            return;
        }

        const { entries } = this._config["_commonSettings"];
        if (!entries) {
            console.error("[fillAppTitle] etries does not exist in _commonSettings");
            return;
        }

        const titleEnv = process.env.BLANK_APP_TITLE;
        if (titleEnv) {
            entries.title = decodeURI(titleEnv);
        }
    }

    getDataSource(storeNameOrDesc, ee) {
        let storeName, storeDesc;
        if (typeof storeNameOrDesc === "string") {
            storeName = storeNameOrDesc;
            storeDesc = this._config[storeName];
        } else {
            storeDesc = storeNameOrDesc;
            storeName = storeDesc.name;
        }

        const { dataSource } = storeDesc;
        if (!dataSource.module) {
            try {
                dataSource.module = userScript.requireLib(dataSource.file)(storeDesc, ee);
            } catch (err) {
                console.error(`[getDataSource] require data source lib for store ${storeName} error: `, err);
                return;
            }
        }

        return dataSource.module;
    }

    prepareAuthLifeCycle() {
        if (!this._config["_serverSettings"]) {
            this._config["_serverSettings"] = { entries: {} };
            return;
        }

        if (!this._config["_serverSettings"].entries.auth) {
            this._config["_serverSettings"].entries.auth = {};
        }

        const { auth } = this._config["_serverSettings"].entries;
        const { findUser, checkPassword, changePassword, willSignIn, didSignIn, willSignOut, didSignOut } = auth;
        if (findUser && typeof findUser === "string") {
            auth.findUser = userScript.create(findUser, "_serverSettings_auth_findUser", ["$db", "$data"], true);
        }

        if (checkPassword && typeof checkPassword === "string") {
            auth.checkPassword = userScript.create(checkPassword, "_serverSettings_auth_checkPassword", [
                "$user",
                "$data",
            ]);
        }

        if (changePassword && typeof changePassword === "string") {
            auth.changePassword = userScript.create(changePassword, "_serverSettings_auth_changePassword", [
                "$user",
                "password",
                "newPassword",
            ]);
        }

        if (willSignIn && typeof willSignIn === "string") {
            auth.willSignIn = userScript.create(willSignIn, "_serverSettings_auth_willSignIn", [
                "$db",
                "$user",
                "$data",
            ]);
        }

        let { createToken } = auth;
        if (!createToken || typeof createToken !== "string") {
            createToken = "delete $user.__v; return Object.assign({}, $user)";
        }

        auth.createToken = userScript.create(createToken, "_serverSettings_auth_createToken", [
            "$db",
            "$user",
            "$prevUser",
            "$data",
        ]);

        if (didSignIn && typeof didSignIn === "string") {
            auth.didSignIn = userScript.create(didSignIn, "_serverSettings_auth_didSignIn", ["$db", "$user", "$data"]);
        }

        if (willSignOut && typeof willSignOut === "string") {
            auth.willSignOut = userScript.create(willSignOut, "_serverSettings_auth_willSignOut", [
                "$db",
                "$user",
                "$data",
            ]);
        }

        if (didSignOut && typeof didSignOut === "string") {
            auth.didSignOut = userScript.create(didSignOut, "_serverSettings_auth_didSignOut", [
                "$db",
                "$user",
                "$data",
            ]);
        }
    }

    async prepareProps(props, storeName, storeDesc, parentPropName) {
        for (const propName of Object.keys(props || {})) {
            const propDesc = props[propName];
            if (propDesc.type === "virtual" && typeof propDesc.load !== "function") {
                const script = propDesc.load || "return null;";
                propDesc.load = userScript.create(script, `${propName}_load`, ["$item", "$baseItem"], false);
            }

            if (propName === "_id" && typeof propDesc.load !== "function") {
                let script;
                if (propDesc.load) {
                    script = propDesc.load;
                } else {
                    switch (propDesc.type) {
                        case "int":
                            script = `return $db.nextSequence("${storeName}Id");`;
                            break;
                        case "string":
                        case "uuid":
                            script = "return $db.newId();";
                    }
                }

                propDesc.load = userScript.create(script, `${storeName}_id_load`, ["$db", "$item"], true);
            }

            if (typeof propDesc.default === "object" && propDesc.default.$expression != null) {
                const fn = new Function("$item", "$user", "$i18n", propDesc.default.$expression);
                propDesc.default = fn;
            }

            if (propDesc.type === "virtualRefList") {
                switch (typeof propDesc.query) {
                    case "object":
                        propDesc.query = this.__prepareQuery(propDesc.query);
                        break;
                    case "string":
                        propDesc.query = new Function("$item", "$user", `$user = $user || {}; ${propDesc.query};`);
                        break;
                }
            }

            if (propDesc.type === "ref" || propDesc.type === "refList") {
                const refStoreProps = await this.getProps(propDesc.store);
                propDesc.refType = refStoreProps._id.type;

                if (propDesc.populateIn) {
                    if (typeof propDesc.populateIn === "string") {
                        propDesc.populateIn = { prop: propDesc.populateIn };
                    } else if (typeof propDesc.populateIn === "object" && typeof propDesc.populateIn.map === "string") {
                        propDesc.populateIn.fn = new Function("$item", propDesc.populateIn.map);
                    }

                    if (!props[propDesc.populateIn.prop]) {
                        props[propDesc.populateIn.prop] = { type: "any", display: "none" };
                    }
                }

                if (propDesc.showAddAction === true) {
                    let actionId = `${propName}_${propDesc.store}_create`;
                    if (parentPropName) {
                        actionId = `${parentPropName}_${actionId}`;
                    }

                    const actionDesc = {
                        _id: actionId,
                        label: `{{$i18n.$stores.${propDesc.store}.storeLabel}}: {{$i18n.$settings.form.newDocument}}`,
                        script: `
                            delete $data._id;
                            return $db.insert("contacts", $data).then(res => res._id);
                        `,
                        clientPostScript: `
                            const toIds = [...($item.toIds || [])];
                            toIds.push($result);
                            $setProperty("toIds", toIds);
                        `,
                        hideInHeader: true,
                        props: propDesc.props,
                    };

                    storeDesc.actions = storeDesc.actions || [];
                    storeDesc.actions.push(actionDesc);
                }
            }

            if (propDesc.props) {
                await this.prepareProps(propDesc.props, storeName, storeDesc, propName);
            }
        }
    }

    isReady() {
        return this._config != null;
    }

    isStore(storeName) {
        return this._config[storeName] != null;
    }

    async isStoreAllowed(storeName, user) {
        const storeDesc = this._config[storeName];

        return storeDesc != null && (await auth.hasReadAccess(storeDesc.access, user));
    }

    async getMongoAccessQuery(storeDescOrName, user) {
        let storeDesc = storeDescOrName;
        if (typeof storeDescOrName === "string") {
            storeDesc = await this.getStoreDesc(storeDescOrName, user);
        }

        if (storeDesc == null) {
            throw new Error("Invalid store");
        }

        return auth.computeMongoQuery(storeDesc.access, user, storeDesc.display === "single");
    }

    getMongoCollectionName(storeName) {
        if (this._config[storeName] && this._config[storeName].baseStore) {
            return this._config[storeName].baseStore;
        }
        return storeName;
    }

    async getReadablePropsForUser(storeDescOrName, user) {
        return this.__getAllowedPropsForUser(storeDescOrName, user, "r");
    }

    async getWritablePropsForUser(storeDescOrName, user) {
        return this.__getAllowedPropsForUser(storeDescOrName, user, "w");
    }

    getStoreProxies(storeName) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null) {
            return [storeName];
        }

        if (storeDesc._proxyStoreNames == null) {
            const baseSn = storeDesc.baseStore ? storeDesc.baseStore : storeName;
            const res = [];
            for (let sn of Object.keys(this._config)) {
                if (
                    sn !== storeName &&
                    res.indexOf(sn) < 0 &&
                    (sn === baseSn || this._config[sn].baseStore === baseSn)
                ) {
                    res.push(sn);
                }
            }

            storeDesc._proxyStoreNames = res;
        }

        return storeDesc._proxyStoreNames;
    }

    getI18n(locale) {
        return this._i18n[locale] || null;
    }

    async getConfig(user, forWeb = false) {
        const start = Date.now();
        if (user == null) {
            return this._config;
        }

        const res = {};
        for (const storeName of Object.keys(this._config)) {
            if (storeName === "_serverSettings") {
                continue;
            }

            let userStoreDesc = await this.__getUserStoreDesc(storeName, user);
            if (userStoreDesc != null) {
                if (userStoreDesc.dataSource && forWeb) {
                    userStoreDesc = Object.assign({}, userStoreDesc);
                    delete userStoreDesc.dataSource;
                }

                res[storeName] = userStoreDesc;
            }
        }

        console.debug("User config ready in:", Date.now() - start);
        return res;
    }

    async getProps(storeName, user, copy) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null) {
            throw new Error(`Invalid storeName ${storeName}`);
        }

        let props;
        if (user == null) {
            props = storeDesc.props;
        } else {
            if (!(await auth.hasReadAccess(storeDesc.access, user)) || storeDesc.type === "workspace") {
                throw new Error("Access to store denied");
            }
            props = await this.__getUserProps(storeDesc.props, user, this.__getUserWorkspace(user, storeName));
        }

        return copy ? cloneDeep(props) : props;
    }

    getLocale() {
        const cs = find.property(this, "_config._commonSettings.entries") || {};

        return cs.defaultLocale || (Array.isArray(cs.locales) && cs.locales[0]) || "en";
    }

    getAllLocales() {
        const cs = find.property(this, "_config._commonSettings.entries") || {};

        return (Array.isArray(cs.locales) && cs.locales) || ["en"];
    }

    getPartialProps(storeName) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null) {
            throw new Error("Invalid storeName");
        }

        const res = {};
        const props = storeDesc.props || {};
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
        for (const label of storeDesc.labels || []) {
            let t = "" + label.text + label.icon + label.color + label.hidden;
            propsFromLabels = propsFromLabels.concat(this.__extractProps(t));
        }

        //Table columns
        const propsFromTableColumns = [];
        for (const tc of storeDesc.tableColumns || []) {
            if (typeof tc === "string") {
                propsFromTableColumns.push(tc);
            } else if (tc.prop) {
                propsFromTableColumns.push(tc.prop);
            }
        }

        //All together
        const p = [].concat(propsFromHeaderTemplate, propsFromLabels, propsFromTableColumns).reduce((prev, current) => {
            if (prev.indexOf(current) < 0) {
                prev.push(current);
            }
            return prev;
        }, []);

        for (const pName of p) {
            res[pName] = props[pName];
        }

        for (const pName of Object.keys(res)) {
            if (res[pName] == null) {
                console.warn("Property used in partial loading not found:", pName);
            }
        }

        return res;
    }

    async getStoreDesc(storeName, user) {
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
        const storeDesc = this._config[storeName];
        if (storeDesc == null) {
            throw new Error("Store not found");
        }

        storeDesc._actionsCache = storeDesc._actionsCache || {};
        if (storeDesc._actionsCache[actionId]) {
            return storeDesc._actionsCache[actionId];
        }

        const action = this.__findAction(storeDesc, actionId);
        if (action == null) {
            throw new Error("Action not found");
        }

        const res = cloneDeep(action);
        const scriptArgs = ["$user", "$item", "$data", "$token", "$request", "$filter"];
        res.script = userScript.create(
            res.script,
            `${storeName}_${res.storeAction ? "storeActions" : "actions"}_${actionId}`,
            scriptArgs
        );
        res.hidden = userScript.create(
            res.hidden || "return false;",
            `${storeName}_${res.storeAction ? "storeActions" : "actions"}_${actionId}_hidden`,
            ["$user", "$item", "$baseItem"],
            true
        );
        res.disabled = userScript.create(
            res.disabled || "return false;",
            `${storeName}_${res.storeAction ? "storeActions" : "actions"}_${actionId}_disabled`,
            ["$user", "$item", "$baseItem"],
            true
        );
        storeDesc._actionsCache[actionId] = res;

        return res;
    }

    getWidgetDesc(storeName, widgetId) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null) {
            throw new Error("Store not found");
        }

        if (storeDesc._widgetsCache == null) {
            storeDesc._widgetsCache = {};
        }

        if (storeDesc._widgetsCache[widgetId] == null) {
            const resJSON = (storeDesc.widgets || []).find(w => w._id === widgetId);
            if (resJSON == null) {
                throw new Error("Widget not found");
            }

            if (resJSON.load == null) {
                throw new Error("Widget load function not defined!");
            }

            const res = cloneDeep(resJSON);
            const scriptArgs = ["$user", "$data", "$filter", "$itemId"]; // $data deprecated. but kept for backward capability.
            res.load = userScript.create(res.load, `${storeName}_widget_load_data_${widgetId}`, scriptArgs);
            storeDesc._widgetsCache[widgetId] = res;
        }

        return storeDesc._widgetsCache[widgetId];
    }

    getStoreRefPairs(storeName) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null) {
            return null;
        }

        if (storeDesc._refPairsCache == null) {
            storeDesc._refPairsCache = [];
            const refs = this.__groupStoreRefsByStore(storeName);
            for (const oppositeStoreName of Object.keys(refs)) {
                const storeRefs = refs[oppositeStoreName];
                const ourProxies = this.getStoreProxies(storeName);
                let oppositeStoreRefs = this.__groupStoreRefsByStore(oppositeStoreName)[storeName] || [];
                for (const p of ourProxies) {
                    const proxyOppositeStoreRefs = this.__groupStoreRefsByStore(oppositeStoreName)[p];
                    if (Array.isArray(proxyOppositeStoreRefs)) {
                        oppositeStoreRefs = oppositeStoreRefs.concat(proxyOppositeStoreRefs);
                    }
                }
                for (const ref of storeRefs) {
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
                            ref: ref,
                            oppositeRef: oppositeRef,
                            oppositeStoreName: oppositeStoreName,
                        });
                    }
                }
            }
        }

        return storeDesc._refPairsCache;
    }

    getTaskDesc(storeName, taskIndex) {
        const storeDesc = this._config[storeName];

        if (storeDesc == null || !Array.isArray(storeDesc.tasks) || taskIndex > storeDesc.tasks.length - 1) {
            return null;
        }

        if (storeDesc._tasksCache == null) {
            storeDesc._tasksCache = [];
        }

        if (!storeDesc._tasksCache[taskIndex]) {
            const res = storeDesc.tasks[taskIndex];
            res.script = userScript.create(res.script, `${storeName}_task_${taskIndex}`);
            storeDesc._tasksCache[taskIndex] = res;
        }

        return storeDesc._tasksCache[taskIndex];
    }

    getHttpHookDesc(storeName, hookIndex) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null || !Array.isArray(storeDesc.httpHooks) || hookIndex > storeDesc.httpHooks.length - 1) {
            return null;
        }

        if (storeDesc._httpHooksCache == null) {
            storeDesc._httpHooksCache = [];
        }

        if (!storeDesc._httpHooksCache[hookIndex]) {
            const res = storeDesc.httpHooks[hookIndex];
            res.script = userScript.create(res.script, `${storeName}_HTTPHook_${hookIndex}`, ["$request"]);
            storeDesc._httpHooksCache[hookIndex] = res;
        }

        return storeDesc._httpHooksCache[hookIndex];
    }

    getStoreEventHandler(storeName, event) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null || storeDesc.storeLifeCycle == null || storeDesc.storeLifeCycle[event] == null) {
            return null;
        }
        if (storeDesc._storeLifeCycleHandlerCache == null) {
            storeDesc._storeLifeCycleHandlerCache = {};
        }
        if (storeDesc._storeLifeCycleHandlerCache[event]) {
            return storeDesc._storeLifeCycleHandlerCache[event];
        }

        if (event !== "migration") {
            const handler = userScript.create(storeDesc.storeLifeCycle[event], `${storeName}_storeEvents_${event}`);
            storeDesc._storeLifeCycleHandlerCache[event] = handler;
            return handler;
        }

        const scripts = [];
        for (const desc of storeDesc.storeLifeCycle[event]) {
            const { version } = desc;
            const fn = userScript.create(desc.script, `${storeName}_storeEvents_${event}_${version}`);
            scripts.push({ version, fn });
        }

        scripts.sort((a, b) => a.version - b.version);
        const handler = async (currentVersion = 0, setter = () => {}) => {
            const result = [];
            for (const script of scripts) {
                const { version, fn } = script;
                if (currentVersion < version) {
                    const res = await fn();
                    await setter(version);
                    currentVersion = version;
                    result.push(res);
                }
            }

            return result.join("\n");
        };

        return handler;
    }

    getItemEventHandler(storeName, event) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null || storeDesc.objectLifeCycle == null || storeDesc.objectLifeCycle[event] == null) {
            return null;
        }

        if (storeDesc._itemLifeCycleHandlerCache == null) {
            storeDesc._itemLifeCycleHandlerCache = {};
        }

        if (storeDesc._itemLifeCycleHandlerCache[event]) {
            return storeDesc._itemLifeCycleHandlerCache[event];
        }

        const handler = userScript.create(storeDesc.objectLifeCycle[event], `${storeName}_itemEvents_${event}`, [
            "$user",
            "$item",
            "$prevItem",
        ]);
        storeDesc._itemLifeCycleHandlerCache[event] = handler;

        return handler;
    }

    getBaseItem(storeName, user) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null) {
            return {};
        }

        const res = configProcessor.getBaseItem(storeDesc, this.__getI18N(storeDesc.i18n), user);
        res._ownerId = user._id;

        return res;
    }

    getBaseConfig(lang) {
        const cs = this._config["_commonSettings"];
        cs.i18n = this.__getI18N(cs.i18n, lang);

        return {
            _commonSettings: cs,
        };
    }

    __computeQuery(query) {
        const res = {};
        for (const propName of Object.keys(query)) {
            const prop = query[propName];
            if (typeof prop === "object" && prop.hasOwnProperty("$expression")) {
                if (typeof prop.$expression === "string") {
                    res[propName] = new Function("$item", "$user", `$user = $user || {}; return ${prop.$expression};`);
                }
            } else {
                res[propName] = this.__computeQuery(prop);
            }
        }

        return res;
    }

    __execQuery(computedQuery, $item, $user) {
        const res = {};
        for (const propName of Object.keys(computedQuery)) {
            const prop = computedQuery[propName];
            if (typeof prop === "function") {
                res[propName] = prop($item, $user);
            } else if (typeof prop === "object") {
                res[propName] = this.__execQuery(prop, $item, $user);
            } else {
                res[propName] = prop;
            }
        }

        return res;
    }

    __prepareQuery(query) {
        const q = this.__computeQuery(query);
        const res = ($item, $user) => {
            return this.__execQuery(q, $item, $user);
        };

        return res;
    }

    async __getAllowedPropsForUser(storeDescOrName, user, permission) {
        let storeDesc = storeDescOrName;
        if (typeof storeDescOrName === "string") {
            storeDesc = await this.getStoreDesc(storeDescOrName, user);
        }

        if (storeDesc == null) {
            throw new Error("Invalid store");
        }

        const res = { __v: true };
        for (const propName of Object.keys(storeDesc.props)) {
            const prop = storeDesc.props[propName];
            if ((prop.type === "ref" || prop.type === "refList") && prop.populateIn) {
                if (!storeDesc.props[prop.populateIn]) {
                    res[prop.populateIn] = { type: "virtual" };
                }
            }

            if (
                !prop.access ||
                prop.access.length === 0 ||
                (await auth.computeAccess(prop.access, user, permission)) === permission
            ) {
                switch (prop.type) {
                    case "object":
                    case "objectList":
                        res[propName] = await this.getReadablePropsForUser(prop, user);
                        break;
                    default:
                        res[propName] = true;
                }
            }
        }

        return res;
    }

    __groupStoreRefsByStore(storeName) {
        const storeDesc = this._config[storeName];
        if (storeDesc == null) {
            return {};
        }

        const refs = {};
        for (let propName of Object.keys(storeDesc.props || {})) {
            const propDesc = storeDesc.props[propName];
            if (
                (propDesc.type === "ref" || propDesc.type === "refList") &&
                !propDesc.disableRefSync &&
                propDesc.store &&
                propDesc.store !== storeName
            ) {
                refs[propDesc.store] = refs[propDesc.store] || [];
                refs[propDesc.store].push({
                    prop: propName,
                    type: propDesc.type,
                    oppositeProp: propDesc.oppositeProp || null,
                    populateIn: propDesc.populateIn,
                });
            }
        }
        return refs;
    }

    async __getUserStoreDesc(storeName, user) {
        const storeDesc = this._config[storeName];
        if (
            storeDesc == null ||
            !(await auth.hasReadAccess(storeDesc.access, user)) ||
            storeDesc.type === "workspace"
        ) {
            return null;
        }

        const res = {};
        const workspace = this.__getUserWorkspace(user);
        const wsStoreDesc = workspace && workspace[storeName];
        for (const p of Object.keys(clientStoreDef)) {
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

        res.props = await this.__getUserProps(storeDesc.props, user, wsStoreDesc);
        res.actions = await this.__getUserActions(storeDesc.actions, user);
        res.storeActions = await this.__getUserActions(storeDesc.storeActions, user);
        res.filters = this.__getComputedFilters(storeDesc.filters, storeName);
        res.i18n = this.__getI18N(storeDesc.i18n, user.lang);
        res.groupAccess = res.ownerAccess = await auth.computeAccess(storeDesc.access, user);
        if (res.display === "single" || res.type === "single") {
            res.headerProperty = null;
        }

        res.name = storeName;
        return res;
    }

    __getComputedFilters(filters, storeName) {
        if (!filters) {
            return filters;
        }

        for (const i in filters) {
            const filter = filters[i];
            if (filter.query && typeof filter.query === "string") {
                filter.query = userScript.create(filter.query, `${storeName}_filters_${i}`, ["$value", "$user"], true);
            }
        }

        return filters;
    }

    __getUserWorkspace(user, storeName) {
        if (user.workspace && this._config[user.workspace]) {
            const workspace = this._config[user.workspace].config;
            if (storeName) {
                return workspace[storeName];
            }

            return workspace;
        }

        return null;
    }

    async __getUserProps(props, user, wsDesc) {
        const res = {};

        for (const propName of Object.keys(props || {})) {
            const propDesc = props[propName];
            const access = await auth.computeAccess(propDesc.access, user);
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
                propDesc.props = await this.__getUserProps(propDesc.props, user);
            }
        }

        return res;
    }

    async __getUserActions(actions, user) {
        //TODO: Tests needed!
        const res = [];
        for (const actionDesc of actions || []) {
            if (await auth.hasExecuteAccess(actionDesc.access, user)) {
                const {
                    _id,
                    access,
                    clientPostScript,
                    clientPreScript,
                    disabled,
                    disableItemReadyCheck,
                    dynamicLabel,
                    formLabel,
                    hidden,
                    hideInHeader,
                    icon,
                    label,
                    showInList,
                    type,
                    wide,
                } = actionDesc;

                const groupAccess = await auth.computeAccess(access, user);
                const _actionDesc = {
                    _id,
                    clientPostScript,
                    clientPreScript,
                    disabled,
                    disableItemReadyCheck,
                    dynamicLabel,
                    formLabel,
                    groupAccess,
                    hidden,
                    hideInHeader,
                    icon,
                    label,
                    showInList,
                    type,
                    wide,
                    ownerAccess: groupAccess,
                };

                if (actionDesc.props != null && Object.keys(actionDesc.props).length > 0) {
                    _actionDesc.props = await this.__getUserProps(actionDesc.props, user);
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
        for (const actionDesc of (__storeAction ? storeDesc.storeActions : storeDesc.actions) || []) {
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
