"use strict";

let taskqClient = require("../taskqClient");
let $db = require("./index");
let sessions = require("../sessions");
let usersCache = require("../usersCache");
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

function createHandler(storeName, item, options = {}) {
    if (taskqClient.wampClient.state !== 1) {
        console.warn("Can't send events when no connection to TaskQueue");
        return;
    }
    if (storeName === "users") {
        delete item.password;
        delete item._activationToken;
        delete item._passwordResetToken;
    }

    let event = {
        event: "create",
        data: [item],
    };
    let uri = `com.stores.${storeName}`;
    let _subscribers = sessions.getSubscribers(uri);
    let subscribers = [], defers = [];
    _subscribers.forEach(subscriber => {
        let d = usersCache.get(subscriber.userId).then(userData => {
            if (!configStore.isStoreAllowed(storeName, userData.user)) {
                return;
            }
            let accessQuery = configStore.getMongoAccessQuery(storeName, userData.user);
            if (accessQuery) {
                var query = { $and: [accessQuery, (subscriber.params || {})] };
            } else {
                query = (subscriber.params || {});
            }
            if (matchQuery(query, item)) {
                subscribers.push({ connId: subscriber.connId, user: userData.user, storeName: storeName });
            }
        });
        defers.push(d);
    });
    Promise.all(defers).then(() => {
        _emitEvents("publish", null, uri, event, subscribers);
        if (!options.noEmitProxyEvents) {
            emitProxyEvents("create", storeName, item);
        }
    });
}

function updateHandler(storeName, item, prevItem, options = {}) {
    if (taskqClient.wampClient.state !== 1) {
        console.warn("Can't send events when no connection to TaskQueue");
        return;
    }
    if (storeName === "users") {
        delete item.password;
        delete item._activationToken;
        delete item._passwordResetToken;
    }
    let uri = `com.stores.${storeName}`;
    let _subscribers = sessions.getSubscribers(uri);
    let listSubscribers = [], singleSubscribers = [], deleteSubscribers = [], moveSubscribers = [], defers = [];
    _subscribers.forEach(subscriber => {
        let d = usersCache.get(subscriber.userId).then(userData => {
            if (!configStore.isStoreAllowed(storeName, userData.user)) {
                return;
            }
            let storeDesc = userData.config[storeName];
            let accessQuery = configStore.getMongoAccessQuery(storeDesc, userData.user);
            let query = (accessQuery ? { $and: [accessQuery, (subscriber.params || {})] } : (subscriber.params || {}));
            if (matchQuery(query, item)) {
                (storeDesc.display === "single" ? singleSubscribers : listSubscribers).push({ connId: subscriber.connId, user: userData.user, storeName: storeName });
                return;
            }

            if (prevItem != null && matchQuery(query, prevItem)) {
                let filtersQuery = Object.assign({}, subscriber.params);
                delete filtersQuery._state;
                let moovedQuery = (accessQuery ? { $and: [accessQuery, filtersQuery] } : filtersQuery);
                if (matchQuery(moovedQuery, item)) {
                    moveSubscribers.push({ connId: subscriber.connId, user: userData.user, storeName: storeName });
                } else {
                    deleteSubscribers.push({ connId: subscriber.connId, user: userData.user, storeName: storeName });
                }
            }
        });
        defers.push(d);
    });
    Promise.all(defers).then(() => {
        if (storeName === "users") {
            delete item.password;
            delete item.activationToken;
            delete item.passwordResetToken;
            let userSessions = sessions.getSubscribers("com.user")
                .filter(s => s.userId === item._id)
                .map(s => s.connId);
            taskqClient.wampClient.call("publish", null, "com.user", { "user": item }, userSessions);
        }
        if (listSubscribers.length > 0) {
            let event = { event: "update", partial: options.partial, data: [item] };
            _emitEvents("publish", null, uri, event, listSubscribers);
        }
        if (singleSubscribers.length > 0) {
            let event = { event: "update", partial: options.partial, data: [Object.assign({}, item, { "_id": storeName })] };
            _emitEvents("publish", null, uri, event, singleSubscribers);
        }
        if (deleteSubscribers.length > 0) {
            let event = { event: "delete", data: [item] };
            _emitEvents("publish", null, uri, event, deleteSubscribers);
        }
        if (moveSubscribers.length > 0) {
            let event = { event: "move", data: [item] };
            _emitEvents("publish", null, uri, event, moveSubscribers);
            taskqClient.wampClient.call("publish", null, uri, event, moveSubscribers);
        }
        if (storeName === "users" && srClient) {
            srClient.call("session.user-update", null, item._id, item);
        }
        if (prevItem != null) {
            emitRefEvents(storeName, item, prevItem);
        }
        if (!options.noEmitProxyEvents) {
            emitProxyEvents("update", storeName, item, prevItem);
        }
    });
}

function deleteHandler(store, item, options = {}) {
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
    if (!options.noEmitProxyEvents) {
        emitProxyEvents("delete", store, item);
    }
}

function emitProxyEvents(handler, storeName, item, prevItem) {
    let proxies = configStore.getStoreProxies(storeName);
    for (let p of proxies) {
        switch (handler) {
            case "create":
                createHandler(p, item, { "noEmitProxyEvents": true });
                break;
            case "delete":
                deleteHandler(p, item, { "noEmitProxyEvents": true });
                break;
            case "update":
                updateHandler(p, item, prevItem, { "noEmitProxyEvents": true });
                break;
        }
    }
}

function emitRefEvents(storeName, item, prevItem) {
    let refPairs = configStore.getStoreRefPairs(storeName).filter(p => p.ref.type === "ref");
    for (let p of refPairs) {
        let oppositeRef = p.oppositeRef;
        if (item[p.ref.prop] === prevItem[p.ref.prop] && oppositeRef.populateIn) {
            console.debug("[emitRefEvents] EMIT ref event on", p.oppositeStoreName, "/", oppositeRef.populateIn);
            let updateData = { "_id": item[p.ref.prop] };
            updateData[oppositeRef.populateIn] = item;
            updateHandler(p.oppositeStoreName, updateData, null, { "partial": true });
        }
    }
}

function _emitEvents(eventName, arg1, arg2, arg3, subscribers) {
    if (Array.isArray(subscribers)) {
        for (let subscriber of subscribers) {
            let readableProps = configStore.getReadablePropsForUser(subscriber.storeName, subscriber.user);
            if (!Object.keys(readableProps).length === 0) {
                continue;
            }
            let eventData = Array.isArray(arg3.data) ? arg3.data[0] : arg3.data;
            let item = $db._copyReadableItemProps(readableProps, eventData);
            arg3.data = Array.isArray(arg3.data) ? [item] : item;
            taskqClient.wampClient.call(eventName, arg1, arg2, arg3, [subscriber.connId]);
        }
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