"use strict";

var assert = require("assert");
var testConfig = require("./config");
var configStore = require("../lib/configStore");
var {clientStoreDef} = require("../lib/const");
configStore.setup(testConfig);

let testUser = {
    "_id": "root",
    "roles": ["test"],
    "lang": "it",
    "workspace": "testWorkspace",
};

describe("configStore", function () {
    describe("#getConfig", function () {
        it("should return only _commonSettings for guest user", function () {
            let c = configStore.getConfig({ "_id": "guest", "roles": ["guest"] });
            let stores = Object.keys(c);
            assert.equal(stores.length, 1);
            assert.equal(stores[0], "_commonSettings");
        });
        it("should not return _serverSettings store when user provided", function () {
            let c = configStore.getConfig(testUser);
            assert.ok(c._serverSettings == null);
        });
        it("should return only stores with read access", function () {
            let c = configStore.getConfig(testUser);
            assert.ok(c.allowedStore != null);
            assert.ok(c.deniedStore1 == null);
            assert.ok(c.deniedStore2 == null);
            assert.ok(c.deniedStore3 == null);
        });
        it("should return only props with read access", function () {
            let c = configStore.getConfig(testUser),
                props = c.allowedStore.props;
            assert.ok(props.propWithEmptyAccess != null);
            assert.ok(props.allowedProp != null);
            assert.ok(props.deniedProp1 == null);
            assert.ok(props.deniedProp2 == null);
        });
        it("should return only actions and storeActions with read access", function () {
            let c = configStore.getConfig(testUser),
                actions = c.allowedStore.actions,
                storeActions = c.allowedStore.storeActions;
            for (let actionDesc of actions) {
                assert.equal(actionDesc._id, "allowedAction");
                assert.notEqual(actionDesc._id, "deniedAction");
            }
            for (let actionDesc of storeActions) {
                assert.equal(actionDesc._id, "allowedAction");
                assert.notEqual(actionDesc._id, "deniedAction");
            }
        });
        it("should copy props thats in 'clientStoreDef' struct", function () {
            let c = configStore.getConfig(testUser),
                store = c.allowedStore;
            for (let propName of Object.keys(clientStoreDef)) {
                assert.ok(store.hasOwnProperty(propName));
            }
        });
        it("should cleanup 'headerProperty' if store.type or store.display is single", function () {
            let c = configStore.getConfig(testUser),
                singleStore = c.singleStore,
                displaySingleStore = c.displaySingleStore;
            assert.ok(singleStore.headerProperty == null);
            assert.ok(displaySingleStore.headerProperty == null);
        });
        it("should assign i18n by user lang", function () {
            let c = configStore.getConfig(testUser),
                i18n = c.allowedStore.i18n;
            assert.deepEqual(i18n, { "hello": "world" });
        });
        it("should apply user workspace", function () {
            let c = configStore.getConfig(testUser),
                storeDesc = c.allowedStore;
            assert.equal(storeDesc.display, "single");
            assert.equal(storeDesc.navGroup, "dashboard");
            assert.equal(storeDesc.props.propWithEmptyAccess.label, "workSpace");
        });
        it("should calculate groupAccess and ownerAccess property", function () {
            let c = configStore.getConfig(testUser),
                storeDesc = c.allowedStore;
            assert.equal(storeDesc.groupAccess, "crud");
            assert.equal(storeDesc.ownerAccess, "crud");
        });
    });
    describe("#getProps", function () {
        it("should throw error when store not in config or user has no access", function () {
            assert.throws(function () {
                configStore.getProps("UNKNOWN_STORE");
            }, /Invalid storeName/);
            assert.throws(function () {
                configStore.getProps("deniedStore1", testUser);
            }, /Access to store denied/);
        });
        it("should return only props with read access", function () {
            let props = configStore.getProps("allowedStore", testUser);
            assert.ok(props.propWithEmptyAccess != null);
            assert.ok(props.allowedProp != null);
            assert.ok(props.deniedProp1 == null);
            assert.ok(props.deniedProp2 == null);
        });
    });
    describe("#getPartialProps", function () {
        it("should return '_id' prop", function () {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props._id != null);
        });
        it("should return '_state' if store type is 'process'", function () {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props._state == null);
            props = configStore.getPartialProps("partialTestsProcessStoreWithHeaderTemplate") || {};
            assert.ok(props._state != null);
        });
        it("should return props used in 'headerTemplate'", function () {
            let props = configStore.getPartialProps("partialTestsProcessStoreWithHeaderTemplate") || {};
            assert.ok(props.hTemplateProp1 != null);
            assert.ok(props.hTemplateProp2 != null);
        });
        it("should return headerProperty if no 'headerTemplate'", function () {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props.hProp != null);
            props = configStore.getPartialProps("partialTestsProcessStoreWithHeaderTemplate") || {};
            assert.ok(props.hProp == null);
        });
        it("should return property in 'orderBy' store setting", function () {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props.orderByProp != null);
        });
        it("should return props used in 'labels' with 'showInList' > 0", function () {
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
        it("should return all props if store type is 'notification'", function () {
            let props = configStore.getPartialProps("partialTestsNotificationStore") || {};
            assert.ok(props.prop1 != null);
            assert.ok(props.prop2 != null);
        });
        it("should return props used in 'tableColumns'", function () {
            let props = configStore.getPartialProps("partialTestsStore") || {};
            assert.ok(props.tableColumnProp1 != null);
            assert.ok(props.tableColumnProp2 != null);
        });
    });
    describe("#getLocale", function () {
        it("should return default default locale if it present", function () {
            configStore.setup({
                "_commonSettings": { "type": "map", "entries": { "defaultLocale": ["fr"] } },
            });
            let lang = configStore.getLocale();
            configStore.setup(testConfig);
            assert.equal(lang, "fr");
        });
        it("should return first locale in 'locales' list if no default", function () {
            configStore.setup({
                "_commonSettings": { "type": "map", "entries": { "locales": ["kz"] } },
            });
            let lang = configStore.getLocale();
            configStore.setup(testConfig);
            assert.equal(lang, "kz");
        });
        it("should return 'en' if config empty", function () {
            configStore.setup({});
            let lang = configStore.getLocale();
            configStore.setup(testConfig);
            assert.equal(lang, "en");
        });
    });
    describe("#getStoreDesc", function () {
        it("should return default store for '_' name", function () {
            let defaultStore = configStore.getStoreDesc("_");
            assert.ok(defaultStore != null);
        });
    });
    describe("#getTaskDesc", function () {
        it("should return null when store not found", function () {
            let taskDesc = configStore.getTaskDesc("UNKNOWN_STORE");
            assert.ok(taskDesc == null);
        });
        it("should return null when task not found", function () {
            let taskDesc = configStore.getTaskDesc("storeWithTask", 10);
            assert.ok(taskDesc == null);
        });
        it("should compile and cache script", function () {
            let taskDesc = configStore.getTaskDesc("storeWithTask", 0);
            assert.equal(typeof taskDesc.script, "function");
            let sameTaskDesc = configStore.getTaskDesc("storeWithTask", 0);
            assert.strictEqual(taskDesc.script, sameTaskDesc.script);
        });
    });
    describe("#getStoreEventHandler", function () {
        it("should return null when store not found", function () {
            let eventHandler = configStore.getStoreEventHandler("UNKNOWN_STORE");
            assert.ok(eventHandler == null);
        });
        it("should return null when handler not found", function () {
            let eventHandler = configStore.getStoreEventHandler("storeWithLifeCycle", "UNKNOWN_EVENT");
            assert.ok(eventHandler == null);
        });
        it("should compile and cache script", function () {
            let eventHandler = configStore.getStoreEventHandler("storeWithLifeCycle", "didStart");
            assert.equal(typeof eventHandler, "function");
            let sameEventHandler = configStore.getStoreEventHandler("storeWithLifeCycle", "didStart");
            assert.strictEqual(eventHandler, sameEventHandler);
        });
    });
    describe("#getItemEventHandler", function () {
        it("should return null when store not found", function () {
            let eventHandler = configStore.getItemEventHandler("UNKNOWN_STORE");
            assert.ok(eventHandler == null);
        });
        it("should return null when handler not found", function () {
            let eventHandler = configStore.getItemEventHandler("storeWithObjectLifeCycle", "UNKNOWN_EVENT");
            assert.ok(eventHandler == null);
        });
        it("should compile and cache script", function () {
            let eventHandler = configStore.getItemEventHandler("storeWithObjectLifeCycle", "willSave");
            assert.equal(typeof eventHandler, "function");
            let sameEventHandler = configStore.getItemEventHandler("storeWithObjectLifeCycle", "willSave");
            assert.strictEqual(eventHandler, sameEventHandler);
        });
    });
    describe("#getActionDesc", function () {
        it("should throw when store not found", function () {
            assert.throws(function () {
                configStore.getActionDesc("UNKNOWN_STORE");
            }, /Store not found/);
        });
        it("should find in actions and storeActions", function () {
            let action = configStore.getActionDesc("users", "test_action");
            let storeAction = configStore.getActionDesc("users", "test_store_action");
            assert.notEqual(action, null);
            assert.notEqual(storeAction, null);
        });
        it("should set flag for storeActions", function () {
            let action = configStore.getActionDesc("users", "test_action");
            let storeAction = configStore.getActionDesc("users", "test_store_action");
            assert.equal(action.storeAction, false);
            assert.equal(storeAction.storeAction, true);
        });
        it("should compile and cache script, hidden and disabled", function () {
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
    describe("#__groupStoreRefsByStore", function () {
        it("should return ref types and opposite prop name if it specified", function () {
            let refs = configStore.__groupStoreRefsByStore("storeWithRefs");
            assert.equal(Object.keys(refs).length, 1);
            assert.equal(refs.otherStore.length, 2);
            assert.equal(refs.otherStore[1].type, "refList");
            assert.equal(refs.otherStore[1].oppositeProp, "otherProp");
        });
    });
    describe("#getRefPairs", function () {
        it("should not return pairs without oppositeProp when more then one refs beetwen stores", function () {
            let refs = configStore.getStoreRefPairs("storeWithTwoAnonimousRefs");
            assert.equal(Object.keys(refs.ref_ref).length, 0);
        });
        it("should return pairs when more then one refs beetwen stores and oppositeProp specified", function () {
            let refs = configStore.getStoreRefPairs("storeWithTwoRefsOneNamed");
            assert.equal(Object.keys(refs.ref_ref).length, 1);
        });
        it("should split refs by type", function () {
            let refs = configStore.getStoreRefPairs("storeWithDifferentRefTypes");
            console.log("11", JSON.stringify(refs));
            assert.equal(Object.keys(refs.ref_ref).length, 1);
            assert.equal(Object.keys(refs.ref_refList).length, 1);
            assert.equal(Object.keys(refs.refList_ref).length, 1);
            assert.equal(Object.keys(refs.refList_refList).length, 1);
        });
    });
});