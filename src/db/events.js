"use strict";

let taskqClient = require("../taskqClient");
let $db = require( "./index");
let sessions = require( "../sessions");
let sift = require( "sift");

$db.on("create", (store, item) => {
    setTimeout(() => {
        if (taskqClient.wampClient.state !== 1) {
            console.warn("Can't send events when no connection to TaskQueue");
            return;
        }
        let event = {
            event: "create",
            data: [item],
        };
        let uri = `com.stores.${store}`;
        let _subscribers = sessions.getSubscribers(uri);
        let subscribers = [];
        _subscribers.forEach(subscriber => {
            if (matchQuery(subscriber.params, item)) {
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
            if (matchQuery(subscriber.params, item)) {
                subscribers.push(subscriber.connId);
                return;
            }
            if (matchQuery(subscriber.params, prevItem)) {
                deleteSubscribers.push(subscriber.connId);
            }
        });
        taskqClient.wampClient.call("publish", null, uri, event, subscribers);
        if (deleteSubscribers.length) {
            taskqClient.wampClient.call("publish", null, uri, deleteEvent, deleteSubscribers);
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