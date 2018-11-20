"use strict";

const taskqClient = require("../taskqClient");
const $db = require("./index");
const configStore = require("../configStore");
const sift = require("sift");

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

    const uri = `com.stores.${storeName}`;
    const { _id, __v } = item;
    const event = { event: "create", data: [{ _id, __v }] };
    taskqClient.wampClient.call(
        "publish",
        (...args) => {
            console.error(...args);
        },
        uri,
        event
    );

    if (!options.noEmitProxyEvents) {
        emitProxyEvents("create", storeName, item);
    }
}

function updateHandler(storeName, item, prevItem, options = {}) {
    if (taskqClient.wampClient.state !== 1) {
        console.warn("Can't send events when no connection to TaskQueue");
        return;
    }

    const uri = `com.stores.${storeName}`;
    const { _id, __v } = item;
    const event = { event: "update", data: [{ _id, __v }] };
    taskqClient.wampClient.call(
        "publish",
        (...args) => {
            console.error(...args);
        },
        uri,
        event
    );

    if (!options.noEmitProxyEvents) {
        emitProxyEvents("update", storeName, item, prevItem);
    }
}

function deleteHandler(storeName, item, options = {}) {
    if (taskqClient.wampClient.state !== 1) {
        console.warn("Can't send events when no connection to TaskQueue");
        return;
    }

    const uri = `com.stores.${storeName}`;
    const { _id } = item;
    const event = { event: "delete", data: [_id] };
    taskqClient.wampClient.call(
        "publish",
        (...args) => {
            console.error(...args);
        },
        uri,
        event
    );

    if (!options.noEmitProxyEvents) {
        emitProxyEvents("delete", storeName, item);
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

async function _emitEvents(eventName, arg1, arg2, arg3, subscribers) {
    if (Array.isArray(subscribers)) {
        for (const subscriber of subscribers) {
            const readableProps = await configStore.getReadablePropsForUser(subscriber.storeName, subscriber.user);
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
