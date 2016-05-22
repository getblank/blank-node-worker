"use strict";

import taskqClient from "../taskqClient";
import $db from "./index";
import sessions from "../sessions";

$db.on("create", (store, item) => {
    setTimeout(() => {
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
    return true;
}