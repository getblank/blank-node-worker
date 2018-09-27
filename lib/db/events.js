"use strict";

const taskqClient = require("../taskqClient");
const $db = require("./index");
const filter = require("./filter");
const sessions = require("../sessions");
const usersCache = require("../usersCache");
const sift = require("sift");
const configStore = require("../configStore");

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

    const event = {
        event: "create",
        data: [item],
    };

    const uri = `com.stores.${storeName}`;
    const _subscribers = sessions.getSubscribers(uri);
    const subscribers = [];
    const promises = [];

    _subscribers.forEach(subscriber => {
        const d = usersCache.get(subscriber.userId).then(async userData => {
            if (!(await configStore.isStoreAllowed(storeName, userData.user))) {
                return;
            }

            const accessQuery = await configStore.getMongoAccessQuery(storeName, userData.user);
            let query;
            if (accessQuery) {
                query = { $and: [accessQuery, subscriber.params || {}] };
            } else {
                query = subscriber.params || {};
            }

            if (matchQuery(query, item)) {
                subscribers.push({ connId: subscriber.connId, user: userData.user, storeName: storeName });
            }
        });

        promises.push(d);
    });

    Promise.all(promises).then(() => {
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

    const uri = `com.stores.${storeName}`;
    const _subscribers = sessions.getSubscribers(uri);
    const listSubscribers = [];
    const singleSubscribers = [];
    const deleteSubscribers = [];
    const moveSubscribers = [];
    const promises = [];

    _subscribers.forEach(subscriber => {
        let userData;
        let storeDesc;
        const d = usersCache
            .get(subscriber.userId)
            .then(async res => {
                userData = res;
                if (!(await configStore.isStoreAllowed(storeName, userData.user))) {
                    return;
                }

                storeDesc = userData.config[storeName];
                return filter.prepare(storeDesc, subscriber.params, userData.user);
            })
            .then(async res => {
                const query = res;
                const accessQuery = await configStore.getMongoAccessQuery(storeDesc, userData.user);
                if (matchQuery(query, item)) {
                    (storeDesc.display === "single" ? singleSubscribers : listSubscribers).push({
                        connId: subscriber.connId,
                        user: userData.user,
                        storeName: storeName,
                    });
                    return;
                }

                // TODO: rewrite this code to use filter module
                if (prevItem != null && matchQuery(query, prevItem)) {
                    const filtersQuery = Object.assign({}, subscriber.params);
                    delete filtersQuery._state;
                    const movedQuery = accessQuery ? { $and: [accessQuery, filtersQuery] } : filtersQuery;
                    if (matchQuery(movedQuery, item)) {
                        moveSubscribers.push({ connId: subscriber.connId, user: userData.user, storeName: storeName });
                    } else {
                        deleteSubscribers.push({
                            connId: subscriber.connId,
                            user: userData.user,
                            storeName: storeName,
                        });
                    }
                }
            });
        promises.push(d);
    });

    Promise.all(promises).then(() => {
        if (storeName === "users") {
            delete item.password;
            delete item.activationToken;
            delete item.passwordResetToken;
            const userSessions = sessions
                .getSubscribers("com.user")
                .filter(s => s.userId === item._id)
                .map(s => s.connId);

            taskqClient.wampClient.call("publish", null, "com.user", { user: item }, userSessions);
        }

        if (listSubscribers.length > 0) {
            const event = { event: "update", partial: options.partial, data: [item] };
            _emitEvents("publish", null, uri, event, listSubscribers);
        }

        if (singleSubscribers.length > 0) {
            const event = {
                event: "update",
                partial: options.partial,
                data: [Object.assign({}, item, { _id: storeName })],
            };
            _emitEvents("publish", null, uri, event, singleSubscribers);
        }

        if (deleteSubscribers.length > 0) {
            const event = { event: "delete", data: [item._id] };
            _emitEvents("publish", null, uri, event, deleteSubscribers);
        }

        if (moveSubscribers.length > 0) {
            const event = { event: "move", data: [item] };
            _emitEvents("publish", null, uri, event, moveSubscribers);
            taskqClient.wampClient.call("publish", null, uri, event, moveSubscribers);
        }

        if (storeName === "users" && srClient) {
            // if (item.isActive) {
            //     const { auth } = configStore.getStoreDesc("_serverSettings").entries;
            //     auth.createToken(item, prevItem)
            //         .then(res => srClient.call("session.user-update", null, item._id, res))
            //         .catch(err => console.error("[$db][events][updateHandler] auth.createToken error: ", err));
            // } else {
            //     srClient.call("session.user-update", null, item._id);
            // }
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

    const event = {
        event: "delete",
        data: [item._id],
    };
    const uri = `com.stores.${store}`;
    const _subscribers = sessions.getSubscribers(uri);
    const subscribers = [];
    _subscribers.forEach(subscriber => {
        subscribers.push(subscriber.connId);
    });
    taskqClient.wampClient.call("publish", null, uri, event, subscribers);

    if (store === "users" && srClient) {
        // srClient.call("session.user-update", null, item._id);
    }

    if (!options.noEmitProxyEvents) {
        emitProxyEvents("delete", store, item);
    }
}

function emitProxyEvents(handler, storeName, item, prevItem) {
    const proxies = configStore.getStoreProxies(storeName);
    for (const p of proxies) {
        switch (handler) {
            case "create":
                createHandler(p, item, { noEmitProxyEvents: true });
                break;
            case "delete":
                deleteHandler(p, item, { noEmitProxyEvents: true });
                break;
            case "update":
                updateHandler(p, item, prevItem, { noEmitProxyEvents: true });
                break;
        }
    }
}

function emitRefEvents(storeName, item, prevItem) {
    const refPairs = configStore.getStoreRefPairs(storeName).filter(p => p.ref.type === "ref");
    for (const p of refPairs) {
        const oppositeRef = p.oppositeRef;

        if (item[p.ref.prop] === prevItem[p.ref.prop] && oppositeRef.populateIn) {
            console.debug("[emitRefEvents] EMIT ref event on", p.oppositeStoreName, "/", oppositeRef.populateIn.prop);
            let updateData = { _id: item[p.ref.prop] };
            updateData[oppositeRef.populateIn.prop] = item;
            updateHandler(p.oppositeStoreName, updateData, null, { partial: true });
        }
    }
}

function _emitEvents(eventName, arg1, arg2, arg3, subscribers) {
    if (Array.isArray(subscribers)) {
        for (const subscriber of subscribers) {
            const readableProps = configStore.getReadablePropsForUser(subscriber.storeName, subscriber.user);
            if (!Object.keys(readableProps).length === 0) {
                continue;
            }

            const eventData = Array.isArray(arg3.data) ? arg3.data[0] : arg3.data;
            const item = $db._copyReadableItemProps(readableProps, eventData);
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

exports.setup = function(wampClient) {
    srClient = wampClient;
};
