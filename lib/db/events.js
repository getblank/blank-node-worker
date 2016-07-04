"use strict";

let taskqClient = require("../taskqClient");
let $db = require("./index");
let sessions = require("../sessions");
let sift = require("sift");
let configStore = require("../configStore");

let srClient;

$db.on("create", (store, item) => {
    setTimeout(() => {
        createHandler(store, item);
    });
});

$db.on("update", (store, item, prevItem) => {
    setTimeout(() => {
        updateHandler(store, item, prevItem);
    });
});

$db.on("delete", (store, item) => {
    setTimeout(() => {
        deleteHandler(store, item);
    });
});

function createHandler(store, item) {
    if (taskqClient.wampClient.state !== 1) {
        console.warn("Can't send events when no connection to TaskQueue");
        return;
    }
    if (store === "users") {
        delete item.hashedPassword;
        delete item.salt;
        delete item.activationToken;
        delete item.passwordResetToken;
    }

    let event = {
        event: "create",
        data: [item],
    };
    let uri = `com.stores.${store}`;
    let _subscribers = sessions.getSubscribers(uri);
    let subscribers = [];
    _subscribers.forEach(subscriber => {
        if (!configStore.isStoreAllowed(store, subscriber.user)) {
            return;
        }
        let accessQuery = configStore.getMongoAccessQuery(store, subscriber.user);
        if (accessQuery) {
            var query = { $and: [accessQuery, subscriber.params] };
        } else {
            query = subscriber.params;
        }
        if (matchQuery(query, item)) {
            subscribers.push(subscriber.connId);
        }
    });
    taskqClient.wampClient.call("publish", null, uri, event, subscribers);
}

function updateHandler(store, item, prevItem) {
    if (taskqClient.wampClient.state !== 1) {
        console.warn("Can't send events when no connection to TaskQueue");
        return;
    }
    let uri = `com.stores.${store}`;
    let _subscribers = sessions.getSubscribers(uri);
    let listSubscribers = [], singleSubscribers = [], deleteSubscribers = [], moveSubscribers = [];
    console.debug("Update event -", store);
    _subscribers.forEach(subscriber => {
        if (!configStore.isStoreAllowed(store, subscriber.user)) {
            return;
        }
        let storeDesc = configStore.getStoreDesc(store, subscriber.user);
        let accessQuery = configStore.getMongoAccessQuery(storeDesc, subscriber.user);
        let query = (accessQuery ? { $and: [accessQuery, subscriber.params] } : subscriber.params);
        if (matchQuery(query, item)) {
            (storeDesc.display === "single" ? singleSubscribers : listSubscribers).push(subscriber.connId);
            return;
        }
        if (matchQuery(query, prevItem)) {
            let filtersQuery = Object.assign({}, subscriber.params);
            delete filtersQuery._state;
            let moovedQuery = (accessQuery ? { $and: [accessQuery, filtersQuery] } : filtersQuery);
            if (matchQuery(moovedQuery, item)) {
                moveSubscribers.push(subscriber.connId);
            } else {
                deleteSubscribers.push(subscriber.connId);
            }
        }
    });
    if (store === "users") {
        delete item.password;
        delete item.activationToken;
        delete item.passwordResetToken;
        let userSessions = sessions.getSubscribers("com.user")
            .filter(s => s.user && s.user._id === item._id)
            .map(s => s.connId);
        taskqClient.wampClient.call("publish", null, "com.user", { "user": item }, userSessions);
    }
    if (listSubscribers.length > 0) {
        let event = { event: "update", data: [item] };
        taskqClient.wampClient.call("publish", null, uri, event, listSubscribers);
    }
    if (singleSubscribers.length > 0) {
        let event = { event: "update", data: [Object.assign({}, item, { "_id": store })] };
        taskqClient.wampClient.call("publish", null, uri, event, singleSubscribers);
    }
    if (deleteSubscribers.length > 0) {
        let event = { event: "delete", data: [item] };
        taskqClient.wampClient.call("publish", null, uri, event, deleteSubscribers);
    }
    if (moveSubscribers.length > 0) {
        let event = { event: "move", data: [item] };
        taskqClient.wampClient.call("publish", null, uri, event, moveSubscribers);
    }
    if (store === "users" && srClient) {
        srClient.call("session.user-update", null, item._id, item);
    }
}

function deleteHandler(store, item) {
    if (taskqClient.wampClient.state !== 1) {
        console.warn("Can't send events when no connection to TaskQueue");
        return;
    }
    let event = {
        event: "delete",
        data: [item._id],
    };
    let uri = `com.stores.${store}`;
    let _subscribers = sessions.getSubscribers(uri);
    let subscribers = [];
    _subscribers.forEach(subscriber => {
        subscribers.push(subscriber.connId);
    });
    taskqClient.wampClient.call("publish", null, uri, event, subscribers);
    if (store === "users" && srClient) {
        srClient.call("session.user-update", null, item._id);
    }
}

function matchQuery(query, item) {
    if (!query) {
        return true;
    }
    if (!item) {
        return false;
    }
    return sift(query, [item]).length == 1;
}

if (process.env.NODE_ENV === "test") {
    exports.matchQuery = matchQuery;
    exports.createHandler = createHandler;
    exports.updateHandler = updateHandler;
    exports.deleteHandler = deleteHandler;
}

exports.setup = function (wampClient) {
    srClient = wampClient;
};