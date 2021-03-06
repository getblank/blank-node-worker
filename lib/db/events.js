"use strict";

const taskqClient = require("../taskqClient");
const $db = require("./index");
const configStore = require("../configStore");
const sift = require("sift");

const pTimeout = t => {
    return new Promise(resolve => setTimeout(resolve, t));
};

$db.on("create", (store, item, tx) => {
    const p = tx ? tx.promise : Promise.resolve();
    p.then(async () => {
        await pTimeout();
        createHandler(store, item);
    }).catch(() => {});
});

$db.on("update", (store, item, prevItem, tx) => {
    const p = tx ? tx.promise : Promise.resolve();
    p.then(async () => {
        await pTimeout();
        updateHandler(store, item, prevItem);
    }).catch(() => {});
});

$db.on("delete", (store, item, tx) => {
    const p = tx ? tx.promise : Promise.resolve();
    p.then(async () => {
        await pTimeout();
        deleteHandler(store, item);
    }).catch(() => {});
});

function createHandler(storeName, item, options = {}) {
    if (taskqClient.wampClient.state !== 1) {
        console.warn("Can't send events when no connection to TaskQueue");

        return;
    }

    const uri = `com.stores.${storeName}`;
    const { _id, __v } = item;
    const event = { event: "create", data: [{ _id, __v }] };
    taskqClient.wampClient.call("publish", () => {}, uri, event);

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
    taskqClient.wampClient.call("publish", () => {}, uri, event);

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
    taskqClient.wampClient.call("publish", () => {}, uri, event);

    if (!options.noEmitProxyEvents) {
        emitProxyEvents("delete", storeName, item);
    }
}

function emitProxyEvents(handler, storeName, item, prevItem) {
    const proxies = configStore.getStoreProxies(storeName);
    for (const p of proxies) {
        if (p === storeName) {
            continue;
        }

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

exports.setup = () => {};
