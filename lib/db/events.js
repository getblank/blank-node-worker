"use strict";

let taskqClient = require("../taskqClient");
let $db = require("./index");
let sessions = require("../sessions");
let sift = require("sift");
let configStore = require("../configStore");

let srClient;

$db.on("create", (store, item) => {
    setTimeout(() => {
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
                var query = {$and: [accessQuery, subscriber.params]};
            } else {
                query = subscriber.params;
            }
            if (matchQuery(query, item)) {
                subscribers.push(subscriber.connId);
            }
        });
        taskqClient.wampClient.call("publish", null, uri, event, subscribers);
    });
});

$db.on("update", (store, item, prevItem) => {
    setTimeout(() => {
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
            event: "update",
            data: [item],
        };
        let deleteEvent = {
            event: "delete",
            data: [item._id],
        };
        let uri = `com.stores.${store}`;
        let _subscribers = sessions.getSubscribers(uri);
        let subscribers = [];
        let deleteSubscribers = [];
        _subscribers.forEach(subscriber => {
            if (!configStore.isStoreAllowed(store, subscriber.user)) {
                return;
            }
            let accessQuery = configStore.getMongoAccessQuery(store, subscriber.user);
            if (accessQuery) {
                var query = {$and: [accessQuery, subscriber.params]};
            } else {
                query = subscriber.params;
            }
            if (matchQuery(query, item)) {
                subscribers.push(subscriber.connId);
                return;
            }
            if (matchQuery(query, prevItem)) {
                deleteSubscribers.push(subscriber.connId);
            }
        });
        taskqClient.wampClient.call("publish", null, uri, event, subscribers);
        if (deleteSubscribers.length) {
            taskqClient.wampClient.call("publish", null, uri, deleteEvent, deleteSubscribers);
        }
        if (store === "users" && srClient) {
            srClient.call("session.user-update", null, item._id, item);
        }
    });
});

$db.on("delete", (store, item) => {
    setTimeout(() => {
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
    });
});

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
}

exports.setup = function (wampClient) {
    srClient = wampClient;
};