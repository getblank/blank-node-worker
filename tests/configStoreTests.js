"use strict";

var assert = require("assert");
var testConfig = require("./config");
var configStore = require("../lib/configStore");
var { clientStoreDef } = require("../lib/const");
configStore.setup(testConfig);

let testUser = {
    _id: "root",
    roles: ["test"],
    lang: "it",
    workspace: "testWorkspace",
};

describe("configStore", () => {
    describe("#getConfig", () => {
        it("should return only allowed stores for guest user", () => {
            const conf = configStore.getConfig({ _id: "guest", roles: ["guest"] });
            const stores = Object.keys(conf);
            for (let i = 0; i < stores.length; i++) {
                assert(stores[i] !== "users", true);
                assert(stores[i] !== "forEachTestStore", true);
                assert(stores[i] !== "deniedStore1", true);
                assert(stores[i] !== "deniedStore2", true);
            }
        });
        it("should not return _serverSettings store when user provided", () => {
            let c = configStore.getConfig(testUser);
            assert.ok(c._serverSettings == null);
        });
        it("should return only stores with read access", async () => {
            const conf = await configStore.getConfig(testUser);
            assert.ok(conf.allowedStore != null);
            assert.ok(conf.deniedStore1 == null);
            assert.ok(conf.deniedStore2 == null);
            assert.ok(conf.deniedStore3 == null);
        });
        it("should return only props with read access", async () => {
            const conf = await configStore.getConfig(testUser);
            const props = conf.allowedStore.props;
            assert.ok(props.propWithEmptyAccess != null);
            assert.ok(props.allowedProp != null);
            assert.ok(props.deniedProp1 == null);
            assert.ok(props.deniedProp2 == null);
        });
        it("should return only actions and storeActions with read access", async () => {
            const conf = await configStore.getConfig(testUser);
            const actions = conf.allowedStore.actions;
            const storeActions = conf.allowedStore.storeActions;
            for (const actionDesc of actions) {
                assert.equal(actionDesc._id, "allowedAction");
                assert.notEqual(actionDesc._id, "deniedAction");
            }
            for (let actionDesc of storeActions) {
                assert.equal(actionDesc._id, "allowedAction");
                assert.notEqual(actionDesc._id, "deniedAction");
            }
        });
        it("should copy props thats in 'clientStoreDef' struct", async () => {
            const c = await configStore.getConfig(testUser);
            const store = c.allowedStore;
            for (let propName of Object.keys(clientStoreDef)) {
                assert.ok(store.hasOwnProperty(propName));
            }
        });
        it("should cleanup 'headerProperty' if store.type or store.display is single", async () => {
            const conf = await configStore.getConfig(testUser);
            const singleStore = conf.singleStore;
            const displaySingleStore = conf.displaySingleStore;
            assert.ok(singleStore.headerProperty == null);
            assert.ok(displaySingleStore.headerProperty == null);
        });
        it("should assign i18n by user lang", async () => {
            const conf = await configStore.getConfig(testUser);
            const i18n = conf.allowedStore.i18n;
            assert.deepEqual(i18n, { hello: "world" });
        });
        it("should apply user workspace", async () => {
            const conf = await configStore.getConfig(testUser);
            const storeDesc = conf.allowedStore;
            assert.equal(storeDesc.display, "single");
            assert.equal(storeDesc.navGroup, "dashboard");
            assert.equal(storeDesc.props.propWithEmptyAccess.label, "workSpace");
        });
        it("should calculate groupAccess and ownerAccess property", async () => {
            const conf = await configStore.getConfig(testUser);
            const storeDesc = conf.allowedStore;
            assert.equal(storeDesc.groupAccess, "vcrudx");
            assert.equal(storeDesc.ownerAccess, "vcrudx");
        });
    });
    describe("#getProps", () => {
        it("should throw error when store not in config or user has no access", async () => {
            try {
                await configStore.getProps("UNKNOWN_STORE");
                throw new Error("should not resolved");
            } catch (err) {
                assert.ok(/Invalid storeName/.exec(err.message));
            }

            try {
                await configStore.getProps("deniedStore1", testUser);
                throw new Error("should not resolved");
            } catch (err) {
                assert.ok(/Access to store denied/.exec(err.message));
            }
        });
        it("should return only props with read access", async () => {
            const props = await configStore.getProps("allowedStore", testUser);
            assert.ok(props.propWithEmptyAccess != null);
            assert.ok(props.allowedProp != null);
            assert.ok(props.deniedProp1 == null);
            assert.ok(props.deniedProp2 == null);
        });
    });
    describe("#getPartialProps", () => {
        it("should return '_id' prop", () => {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props._id != null);
        });
        it("should return '_state' if store type is 'process'", () => {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props._state == null);
            props = configStore.getPartialProps("partialTestsProcessStoreWithHeaderTemplate") || {};
            assert.ok(props._state != null);
        });
        it("should return props used in 'headerTemplate'", () => {
            let props = configStore.getPartialProps("partialTestsProcessStoreWithHeaderTemplate") || {};
            assert.ok(props.hTemplateProp1 != null);
            assert.ok(props.hTemplateProp2 != null);
        });
        it("should return headerProperty if no 'headerTemplate'", () => {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props.hProp != null);
            props = configStore.getPartialProps("partialTestsProcessStoreWithHeaderTemplate") || {};
            assert.ok(props.hProp == null);
        });
        it("should return property in 'orderBy' store setting", () => {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props.orderByProp != null);
        });
        it("should return props used in 'labels' with 'showInList' > 0", () => {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            //text
            assert.ok(props.labelTextProp != null);
            //icon
            assert.ok(props.labelIconProp != null);
            //color
            assert.ok(props.labelColorProp != null);
            //hidden
            assert.ok(props.labelHiddenProp != null);
        });
        it("should return all props if store type is 'notification'", () => {
            let props = configStore.getPartialProps("partialTestsNotificationStore") || {};
            assert.ok(props.prop1 != null);
            assert.ok(props.prop2 != null);
        });
        it("should return props used in 'tableColumns'", () => {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props.tableColumnProp1 != null);
            assert.ok(props.tableColumnProp2 != null);
        });
    });
    describe("#getLocale", () => {
        it("should return default default locale if it present", () => {
            configStore.setup({
                _commonSettings: { type: "map", entries: { defaultLocale: ["fr"] } },
            });
            let lang = configStore.getLocale();
            configStore.setup(testConfig);
            assert.equal(lang, "fr");
        });
        it("should return first locale in 'locales' list if no default", () => {
            configStore.setup({
                _commonSettings: { type: "map", entries: { locales: ["kz"] } },
            });
            let lang = configStore.getLocale();
            configStore.setup(testConfig);
            assert.equal(lang, "kz");
        });
        it("should return 'en' if config empty", () => {
            configStore.setup({});
            let lang = configStore.getLocale();
            configStore.setup(testConfig);
            assert.equal(lang, "en");
        });
    });
    describe("#getStoreDesc", () => {
        it("should return default store for '_' name", () => {
            let defaultStore = configStore.getStoreDesc("_");
            assert.ok(defaultStore != null);
        });
    });
    describe("#getTaskDesc", () => {
        it("should return null when store not found", () => {
            let taskDesc = configStore.getTaskDesc("UNKNOWN_STORE");
            assert.ok(taskDesc == null);
        });
        it("should return null when task not found", () => {
            let taskDesc = configStore.getTaskDesc("storeWithTask", 10);
            assert.ok(taskDesc == null);
        });
        it("should compile and cache script", () => {
            let taskDesc = configStore.getTaskDesc("storeWithTask", 0);
            assert.equal(typeof taskDesc.script, "function");
            let sameTaskDesc = configStore.getTaskDesc("storeWithTask", 0);
            assert.strictEqual(taskDesc.script, sameTaskDesc.script);
        });
    });
    describe("#getStoreEventHandler", () => {
        it("should return null when store not found", () => {
            let eventHandler = configStore.getStoreEventHandler("UNKNOWN_STORE");
            assert.ok(eventHandler == null);
        });
        it("should return null when handler not found", () => {
            let eventHandler = configStore.getStoreEventHandler("storeWithLifeCycle", "UNKNOWN_EVENT");
            assert.ok(eventHandler == null);
        });
        it("should compile and cache script", () => {
            let eventHandler = configStore.getStoreEventHandler("storeWithLifeCycle", "didStart");
            assert.equal(typeof eventHandler, "function");
            let sameEventHandler = configStore.getStoreEventHandler("storeWithLifeCycle", "didStart");
            assert.strictEqual(eventHandler, sameEventHandler);
        });
    });
    describe("#getItemEventHandler", () => {
        it("should return null when store not found", () => {
            let eventHandler = configStore.getItemEventHandler("UNKNOWN_STORE");
            assert.ok(eventHandler == null);
        });
        it("should return null when handler not found", () => {
            let eventHandler = configStore.getItemEventHandler("storeWithObjectLifeCycle", "UNKNOWN_EVENT");
            assert.ok(eventHandler == null);
        });
        it("should compile and cache script", () => {
            let eventHandler = configStore.getItemEventHandler("storeWithObjectLifeCycle", "willSave");
            assert.equal(typeof eventHandler, "function");
            let sameEventHandler = configStore.getItemEventHandler("storeWithObjectLifeCycle", "willSave");
            assert.strictEqual(eventHandler, sameEventHandler);
        });
    });
    describe("#getActionDesc", () => {
        it("should throw when store not found", () => {
            assert.throws(() => {
                configStore.getActionDesc("UNKNOWN_STORE");
            }, /Store not found/);
        });
        it("should find in actions and storeActions", () => {
            let action = configStore.getActionDesc("users", "test_action");
            let storeAction = configStore.getActionDesc("users", "test_store_action");
            assert.notEqual(action, null);
            assert.notEqual(storeAction, null);
        });
        it("should set flag for storeActions", () => {
            let action = configStore.getActionDesc("users", "test_action");
            let storeAction = configStore.getActionDesc("users", "test_store_action");
            assert.equal(action.storeAction, false);
            assert.equal(storeAction.storeAction, true);
        });
        it("should compile and cache script, hidden and disabled", () => {
            let action = configStore.getActionDesc("users", "test_action");
            assert.equal(typeof action.script, "function");
            assert.equal(typeof action.hidden, "function");
            assert.equal(typeof action.disabled, "function");
            let sameAction = configStore.getActionDesc("users", "test_action");
            assert.strictEqual(action.script, sameAction.script);
            assert.strictEqual(action.hidden, sameAction.hidden);
            assert.strictEqual(action.disabled, sameAction.disabled);
        });
    });
    describe("#__groupStoreRefsByStore", () => {
        it("should return ref types and opposite prop name if it specified", () => {
            let refs = configStore.__groupStoreRefsByStore("storeWithRefs");
            assert.equal(Object.keys(refs).length, 2);
            assert.equal(refs.otherStore.length, 2);
            assert.equal(refs.otherStore[1].type, "refList");
            assert.equal(refs.otherStore[1].oppositeProp, "otherProp");
        });
        it("should not return self store refs, only users refs", () => {
            let refs = configStore.__groupStoreRefsByStore("storeWithSelfRefs");
            assert.equal(Object.keys(refs).length, 1);
        });
    });
    describe("#getRefPairs", () => {
        it("should not return pairs without oppositeProp when more then one refs beetwen stores", () => {
            let refs = configStore.getStoreRefPairs("storeWithTwoAnonimousRefs");
            assert.equal(refs.length, 0);
        });
        it("should return pairs when more then one refs beetwen stores and oppositeProp specified", () => {
            let refs = configStore.getStoreRefPairs("storeWithTwoRefsOneNamed");
            assert.equal(refs.length, 1);
        });
        it("should return refs with different types", () => {
            let refs = configStore.getStoreRefPairs("storeWithDifferentRefTypes");
            assert.equal(refs.length, 4);
        });
    });
    describe("#getStoreProxies", () => {
        it("should  return base store and other proxies", () => {
            let proxies = configStore.getStoreProxies("proxyStore1");
            assert.equal(proxies.length, 2);
            assert.equal(proxies.indexOf("baseProxyStore") >= 0, true);
            assert.equal(proxies.indexOf("proxyStore2") >= 0, true);
        });
    });
    describe("#__computeQuery", () => {
        it("should compute $expression to function in query", () => {
            let query = {
                _id: {
                    $expression: "$item._id",
                },
                _ownerId: {
                    $expression: "$user._id",
                },
            };
            let res = configStore.__computeQuery(query);
            assert.equal(typeof res._id, "function");
            assert.equal(typeof res._ownerId, "function");
        });
    });
    describe("#__execQuery", () => {
        it("should return prepared query", () => {
            let query = {
                _id: {
                    $expression: "$item._id",
                },
                _ownerId: {
                    $expression: "$user._id",
                },
            };
            let item = { _id: "itemId" };
            let user = { _id: "userId" };
            query = configStore.__computeQuery(query);
            let res = configStore.__execQuery(query, item, user);
            assert.equal(res._id, "itemId");
            assert.equal(res._ownerId, "userId");
        });
    });
    describe("#__prepareQuery", () => {
        it("should return query function that returns prepared query", () => {
            let query = {
                _id: {
                    $expression: "$item._id",
                },
                _ownerId: {
                    $expression: "$user._id",
                },
            };
            let item = { _id: "itemId" };
            let user = { _id: "userId" };
            query = configStore.__prepareQuery(query);
            assert.equal(typeof query, "function");
            let res = query(item, user);
            assert.equal(res._id, "itemId");
            assert.equal(res._ownerId, "userId");
        });
    });
});
