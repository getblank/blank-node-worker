module.exports = {
    "users": {
        "access": [
            { "role": "root", "permissions": "crud" },
        ],
        "display": "list",
        "navOrder": 0,
        "label": "{{$i18n.storeLabel}}",
        "labels": [],
        "props": require("./defaultConfig").mergeProps({
            "testProp": {
                "type": "string",
                "display": "textInput",
            },
            "intProp": {
                "type": "int",
                "display": "numberInput",
            },
            "floatProp": {
                "type": "float",
                "display": "numberInput",
            },
            "virtualProp": {
                "type": "virtual",
                "display": "textInput",
                "load": "return $item.testProp + '_virtual'",
            },
            "objectOfVirtuals": {
                "type": "object",
                "formOrder": 0,
                "props": {
                    "nestedProp": {
                        "type": "string",
                        "display": "textInput",
                        "label": "",
                        "formOrder": 0,
                    },
                    "nestedVirtualProp": {
                        "type": "virtual",
                        "display": "none",
                        "label": "",
                        "formOrder": 0,
                        "load": "return $item.nestedProp + $baseItem.testProp",
                    },
                },
            },
            "objectListOfVirtuals": {
                "type": "objectList",
                "display": "none",
                "label": "",
                "formOrder": 0,
                "props": {
                    "nestedProp": {
                        "type": "string",
                        "display": "textInput",
                        "label": "",
                        "formOrder": 0,
                    },
                    "nestedVirtualProp": {
                        "type": "virtual",
                        "display": "none",
                        "label": "",
                        "formOrder": 0,
                        "load": "return $baseItem.testProp + $item.nestedProp",
                    },

                },
            },
        }),
        "actions": [
            {
                "_id": "return_item_test_property",
                "label": "",
                "script": "return $item.test;",
                "hidden": "false",
            },
            {
                "_id": "test_action",
                "label": "",
                "script": "console.log('test');",
                "hidden": "false",
            },
            {
                "_id": "hidden_if_item_hidden",
                "label": "",
                "script": "console.log('hidden');",
                "hidden": "return $item.hidden;",
            },
            {
                "_id": "disabled_if_item_disabled",
                "label": "",
                "script": "console.log('disabled');",
                "disabled": "return $item.disabled;",
            },
            {
                "_id": "availability_test",
                "script": "if (typeof require === 'function' && $db != null && typeof $db.get === 'function') {return 'ok';} else {return 'fail';}",
            },
            {
                "_id": "promise_test",
                "script": `return new Promise((resolve, reject) => {
                    setTimeout(function() {
                        resolve("42");
                    }, 1);
                });`,
            },
        ],
        "storeActions": [
            {
                "_id": "test_store_action",
                "label": "",
                "script": "return 'store_action_result';",
                "hidden": "false",
            },
        ],
        "objectLifeCycle": {
            "willCreate": "if ($item.testProp === 'Error') {return 'Error'}; $item.testProp = '42'",
            "willRemove": `
                return new Promise((resolve, reject) => {
                    if ($item.testProp === "toDelete3") {
                        reject(new Error('NO_DELETE'))
                    };
                    resolve();
                });
            `,
        },
        "storeLifeCycle": {},
        "filters": {
            "_default": {
                "query": {
                    "name": {
                        "$regex": "$value",
                    },
                },
            },
        },
        "httpHooks": [],
        "tasks": [],
        "i18n": {
            "storeLabel": "testStore",
        },
    },
    "deniedStore1": {
        "access": [
            { "role": "root", "permissions": "-" },
        ],
        "display": "list",
        "navOrder": 0,
        "label": "{{$i18n.storeLabel}}",
        "labels": [],
        "props": require("./defaultConfig").mergeProps({
            "defaultProp": {
                "type": "string",
                "display": "textInput",
            },
        }),
        "actions": [],
        "objectLifeCycle": {},
        "storeLifeCycle": {},
        "filters": {},
        "httpHooks": [],
        "tasks": [],
        "i18n": {
            "storeLabel": "class",
        },
    },
    "deniedStore2": {
        "access": [
            { "role": "test", "permissions": "cud" },
        ],
    },
    "deniedStore3": {
        "access": [
            { "role": "noTest", "permissions": "crud" },
        ],
    },
    "partialTestsStore": {
        "headerProperty": "hProp",
        "orderBy": "orderByProp",
        "tableColumns": [
            "tableColumnProp1",
            {
                "prop": "tableColumnProp2",
            },
        ],
        "props": require("./defaultConfig").mergeProps({
            "_id": {},
            "_state": {},
            "name": {},
            "hProp": {},
            "labelTextProp": {},
            "labelIconProp": {},
            "labelColorProp": {},
            "labelHiddenProp": {},
            "orderByProp": {},
            "tableColumnProp1": {},
            "tableColumnProp2": {},
        }),
        "labels": [
            {
                "text": "!!!!!!!!!!!!!{{$item.labelTextProp}}",
                "icon": "{{$item.labelIconProp}}ololo",
                "color": "{{#if $item.labelColorProp}}_____{{/if}}",
                "hidden": "_______________{{$item.labelHiddenProp}}____________",
            },
        ],
    },
    "partialTestsNotificationStore": {
        "type": "notification",
        "props": require("./defaultConfig").mergeProps({
            "_id": {},
            "prop1": {},
            "prop2": {},
        }),
    },
    "partialTestsProcessStoreWithHeaderTemplate": {
        "type": "process",
        "headerTemplate": "{{$item.hTemplateProp1}} {{$item.hTemplateProp2}}",
        "headerProperty": "hProp",
        "props": require("./defaultConfig").mergeProps({
            "_id": {},
            "_state": {},
            "hProp": {},
            "hTemplateProp1": {},
            "hTemplateProp2": {},
        }),
    },
    "allowedStore": {
        "access": [
            { "role": "test", "permissions": "crud" },
        ],
        "props": require("./defaultConfig").mergeProps({
            "_id": {},
            "name": {},
            "labelTextProp": {},
            "labelIconProp": {},
            "propWithEmptyAccess": {},
            "allowedProp": { "access": [{ "role": "test", "permissions": "crud" }] },
            "deniedProp1": { "access": [{ "role": "test", "permissions": "-r" }] },
            "deniedProp2": { "access": [{ "role": "noTest", "permissions": "r" }] },
        }),
        "actions": [
            { "_id": "allowedAction", "access": [{ "role": "test", "permissions": "crud" }] },
            { "_id": "deniedAction", "access": [{ "role": "test", "permissions": "-r" }] },
        ],
        "storeActions": [
            { "_id": "allowedAction", "access": [{ "role": "test", "permissions": "crud" }] },
            { "_id": "deniedAction", "access": [{ "role": "test", "permissions": "-r" }] },
        ],
        "labels": [
            {
                "text": "{{$item.labelTextProp}}",
                "icon": "{{$item.labelIconProp}}",
            },
        ],
        "i18n": {
            "it": {
                "hello": "world",
            },
        },
    },
    "storeForPopulating": {
        "props": require("./defaultConfig").mergeProps({
            "userId": {
                "type": "ref",
                "display": "none",
                "store": "users",
                "populateIn": "user",
            },
        }),
    },
    "singleStore": {
        "type": "single",
        "headerProperty": "testProp",
    },
    "displaySingleStore": {
        "display": "single",
        "headerProperty": "testProp",
        "props": require("./defaultConfig").mergeProps({
            "testProp": {
                "type": "string",
                "display": "textInput",
                "label": "test",
                "default": "42",
            },
        }),
    },
    "storeWithRefs": {
        "props": require("./defaultConfig").mergeProps({
            "ref": {
                "type": "ref",
                "store": "otherStore",
            },
            "refListWithProp": {
                "type": "refList",
                "store": "otherStore",
                "oppositeProp": "otherProp",
            },
        }),
    },
    "storeWithSelfRefs": {
        "props": {
            "ref1": {
                "type": "ref",
                "store": "storeWithSelfRefs",
                "oppositeProp": "ref2",
            },
            "ref2": {
                "type": "ref",
                "store": "storeWithSelfRefs",
                "oppositeProp": "ref1",
            },
        },
    },
    "storeWithTwoAnonimousRefs": {
        "props": require("./defaultConfig").mergeProps({
            "ref1": {
                "type": "ref",
                "store": "storeWithTwoAnonimousRefsOpposite",
            },
            "ref2": {
                "type": "ref",
                "store": "storeWithTwoAnonimousRefsOpposite",
            },
        }),
    },
    "storeWithTwoAnonimousRefsOpposite": {
        "props": require("./defaultConfig").mergeProps({
            "ref": {
                "type": "ref",
                "store": "storeWithTwoAnonimousRefs",
            },
        }),
    },
    "storeWithTwoRefsOneNamed": {
        "props": require("./defaultConfig").mergeProps({
            "ref1": {
                "type": "ref",
                "store": "storeWithTwoRefsOneNamedOpposite",
                "oppositeProp": "ref",
            },
            "ref2": {
                "type": "ref",
                "store": "storeWithTwoRefsOneNamedOpposite",
            },
        }),
    },
    "storeWithTwoRefsOneNamedOpposite": {
        "props": require("./defaultConfig").mergeProps({
            "ref": {
                "type": "ref",
                "store": "storeWithTwoRefsOneNamed",
                "oppositeProp": "ref1",
            },
        }),
    },
    "storeWithDifferentRefTypes": {
        "props": require("./defaultConfig").mergeProps({
            "ref": { "type": "ref", "store": "storeWithDifferentRefTypesOpposite", "oppositeProp": "ref" },
            "refList": { "type": "refList", "store": "storeWithDifferentRefTypesOpposite", "oppositeProp": "ref1" },
            "ref1": { "type": "ref", "store": "storeWithDifferentRefTypesOpposite", "oppositeProp": "refList" },
            "refList1": { "type": "refList", "store": "storeWithDifferentRefTypesOpposite", "oppositeProp": "refList1" },
        }),
    },
    "storeWithDifferentRefTypesOpposite": {
        "props": require("./defaultConfig").mergeProps({
            "ref": { "type": "ref", "store": "storeWithDifferentRefTypes", "oppositeProp": "ref" },
            "refList": { "type": "refList", "store": "storeWithDifferentRefTypes", "oppositeProp": "ref1" },
            "ref1": { "type": "ref", "store": "storeWithDifferentRefTypes", "oppositeProp": "refList" },
            "refList1": { "type": "refList", "store": "storeWithDifferentRefTypes", "oppositeProp": "refList1" },
        }),
    },
    "storeWithTask": {
        "tasks": [
            {
                "schedule": "*/5  *   *   *   *  *",
                "script": "if (typeof require === 'function' && $db != null && typeof $db.get === 'function') {console.warn('42');}",
            },
        ],
    },
    "storeWithLifeCycle": {
        "storeLifeCycle": {
            "didStart": "if (typeof require === 'function' && $db != null && typeof $db.get === 'function') {console.warn('42');}",
        },
    },
    "storeWithObjectLifeCycle": {
        "objectLifeCycle": {
            "willSave": "if (typeof require === 'function' && $db != null && typeof $db.get === 'function') {console.warn('42');}",
        },
    },
    "storeWithVirtualProps": {
        "props": require("./defaultConfig").mergeProps({
            "v1": {
                "type": "virtual",
                "display": "text",
                "load": "return 'v1';",
            },
            "listProp": {
                "type": "objectList",
                "formOrder": 0,
                "props": {
                    "v2": {
                        "type": "virtual",
                        "display": "text",
                        "load": "return 'v2';",
                    },
                },
            },
        }),
    },
    "storeWithHttpHook": {
        "display": "list",
        "navOrder": 0,
        "label": "{{$i18n.storeLabel}}",
        "labels": [],
        "props": require("./defaultConfig").mergeProps({
            "defaultProp": {
                "type": "string",
                "formOrder": 10,
                "display": "textInput",
            },
        }),
        "actions": [],
        "objectLifeCycle": {},
        "storeLifeCycle": {},
        "filters": {},
        "httpHooks": [
            {
                "uri": "/resolved/:id",
                "method": "POST",
                "script": "return new Promise((resolve, reject) => {resolve('42')});",
            },
            {
                "uri": "/rejected/:id",
                "method": "POST",
                "script": "return new Promise((resolve, reject) => {reject('42')});",
            },
            {
                "uri": "/async/:id",
                "method": "POST",
                "script": "return $request.params.id;",
            },
        ],
        "tasks": [],
        "i18n": {
            "storeLabel": "class",
        },
    },
    "testWorkspace": {
        "type": "workspace",
        "config": {
            "allowedStore": {
                "display": "single",
                "navGroup": "dashboard",
                "props": {
                    "propWithEmptyAccess": {
                        "label": "workSpace",
                    },
                },
            },
        },
    },
    "_serverSettings": {
        "type": "map",
        "entries": {
            "serverParam": true,
        },
    },
    "_commonSettings": {
        "type": "map",
        "access": [
            { "role": "all", "permissions": "crud" },
            { "role": "guest", "permissions": "crud" },
        ],
        "entries": {
            "title": "Default title",
            "locales": ["kz", "en", "ru"],
            "defaultLocale": "en",
            "userActivation": false,
            "meta": [
                { "name": "description", "content": "Application description" },
                { "name": "author", "content": "Application author" },
            ],
            "links": [
                { "rel": "canonical", "href": "http://mysite.com/example" },
            ],
            "lessVars": {
                //"@baseColor": "#FF0044"
            },
            //"profileLabel": "",
            //"profileIcon": "",
            "signInProps": {
                "login": {
                    "type": "string",
                    "display": "textInput",
                    "label": "{{$i18n.$settings.common.email}}",
                    "required": true,
                    "formOrder": 1,
                },
                "password": {
                    "type": "string",
                    "display": "password",
                    "label": "{{$i18n.$settings.common.password}}",
                    "required": true,
                    "formOrder": 2,
                },
            },
            "resetPasswordDisabled": false,
            "signUpDisabled": false,
            "resetPasswordProps": {
                "password": {
                    "type": "string",
                    "display": "password",
                    "label": "{{$i18n.$settings.resetPassword.newPassword}}",
                    "required": true,
                    "formOrder": 2,
                },
            },
            "resetPasswordRequestProps": {
                "email": {
                    "type": "string",
                    "display": "textInput",
                    "label": "{{$i18n.$settings.common.email}}",
                    "required": true,
                    "pattern": { "value": "^\\S+@\\S+\\.\\S+$", "message": "{{$i18n.$settings.signUp.invalidEmail}}" },
                },
            },
            "signUpProps": {
                "email": {
                    "type": "string",
                    "display": "newUsernameInput",
                    "pattern": { "value": "^\\S+@\\S+\\.\\S+$", "message": "{{$i18n.$settings.signUp.invalidEmail}}" },
                    "label": "{{$i18n.$settings.common.email}}",
                    "required": true,
                    "formOrder": 1,
                },
                "password": {
                    "type": "string",
                    "display": "password",
                    "label": "{{$i18n.$settings.common.password}}",
                    "required": true,
                    "formOrder": 2,
                },
                "eula": {
                    "type": "bool",
                    "display": "checkbox",
                    "label": "{{{$i18n.$settings.signUp.eulaCheck}}}",
                    "required": true,
                    "formOrder": 4,
                },
            },
        },
        "i18n": {
            "en": {
                "install": {
                    "hello": "Hi, let's start now",
                    "license": "License agreement",
                    "createRoot": "Create root account",
                    "accept": "Accept",
                    "next": "Next",
                },
                "signIn": {
                    "action": "Sign in",
                    "title": "Sign in",
                    "error": "Login or password incorrect",
                    "restoreLinkSent": "Email with recent link sent. If you provide correct address, you will receive it within 10 minutes",
                },
                "signOut": {
                    "action": "Sign out",
                },
                "sendResetLink": {
                    "title": "Password restore",
                    "link": "I forgot password",
                    "action": "Send link",
                    "emailSubject": "Password restore",
                },
                "signUp": {
                    "title": "Registration",
                    "action": "Register",
                    "loginInUse": "E-mail already in use",
                    "success": "Successful registration. You can sign in now using your e-mail and password.",
                    "successNeedActivation": "An activation email has been sent to the email address provided.",
                    "eulaCheck": "I accept the terms in the license agreement",
                    "subscribeCheck": "I want to receive information e-mails",
                    "activationEmailSubject": "Account activation",
                    "invalidEmail": "Invalid email",
                    "registrationSuccessEmailSubject": "Congratulations with registration",
                },
                "resetPassword": {
                    "title": "Password change",
                    "oldPassword": "Current password",
                    "newPassword": "New password",
                    "action": "change",
                    "successEmailSubject": "Password was changed",
                },
                "profile": {
                    "link": "Profile",
                    "title": "Profile",
                    "changeLogin": "Login change",
                    "newLogin": "New login",
                    "saved": "Profile info did save",
                    "passwordSaved": "Password did change",
                },
                "filters": {
                    "title": "Filter",
                    "clear": "reset",
                    "all": "All",
                    "search": "Search",
                    "enterSearchText": "Search",
                },
                "form": {
                    "save": "Save",
                    "cancel": "Cancel",
                    "delete": "Delete",
                    "newObject": "New object",
                    "addToObjectList": "Add",
                    "e404": "There is no such object",
                    "e404prompt": "Please create one or select from list",
                    "selected": "Selected",
                    "all": "All",
                    "emptyPreview": "Please select element from list...",
                    "filterNotMatch": "Selected object does not match filter conditions",
                    "deleted": "Item deleted",
                    "notSaved": "Not saved – ",
                    "pickFile": "Choose file",
                    "dropFile": "or drop here",
                },
                "notifications": {
                    "empty": "No notifications",
                    "previously": "Previously",
                },
                "comments": {
                    "label": "Comments",
                    "placeholder": "Write...",
                },
                "common": {
                    "userName": "Login",
                    "email": "E-mail address",
                    "password": "Password",
                    "cancel": "Cancel",
                    "language": "Language",
                    "saved": "changes saved",
                    "loadingData": "loading data",
                    "datePattern": "DD.MM.YYYY",
                    "apply": "Apply",
                    "today": "Today",
                    "yesterday": "Yesterday",
                    "week": "Week",
                    "month": "Month",
                    "actionError": "Something went wrong: ",
                    "recordsOnPage": "Records on page: ",
                },
                "lists": {
                    "empty": "Looks like there is nothing here...",
                    "notFound": "Nothing found",
                    "new": "Creating item",
                },
                "errors": {
                    "requiredField": "Required field",
                    "invalidPattern": "Incorrect format",
                    "emailInvalid": "Invalid e-mail",
                    "emailUsed": "E-mail in use",
                    "save": "Error while saving changes",
                    "common": "Something went wrong...",
                    "action": "Sorry, but we unable to process your request",
                    "delete": "Delete error",
                    "INVALID_OLD_PASSWORD": "Invalid old password",
                    "PASSWORD_NOT_MATCHED": "Invalid password",
                    "EMAIL_NOT_FOUND": "E-mail address not found",
                },
            },
        },
    },
};