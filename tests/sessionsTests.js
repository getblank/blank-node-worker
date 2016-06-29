"use strict";

let assert = require("assert");
let sessions = require("../lib/sessions");

describe("Sessions", function () {
    it("should store provided sessions", function () {
        let session = {
            apiKey: 1,
            userId: 2,
            connections: [],
            lastRequest: new Date().toISOString(),
        };
        sessions.update(session);
        assert.equal(Object.keys(sessions.sessions).length, 1);
    });
    it("should return stored session by provided apiKey", function () {
        let session = {
            apiKey: 1,
            userId: 3,
            connections: [],
            lastRequest: new Date().toISOString(),
        };
        sessions.update(session);
        let returnedSession = sessions.get(session.apiKey);
        assert.equal(session.apiKey, returnedSession.apiKey);
    });
    it("should delete stored session by session apiKey", function () {
        let session = {
            apiKey: 4,
            userId: 5,
            connections: [],
            lastRequest: new Date().toISOString(),
        };
        sessions.update(session);
        sessions.delete(session);
        assert.equal(sessions.get(session.apiKey), undefined);
    });
    it("should return connections on provided topic", function () {
        let session = {
            apiKey: 4,
            userId: 5,
            connections: [
                {connId: 45, subscriptions: {"users": null, "config": null}},
                {connId: 54, subscriptions: {"users": null}},
            ],
            lastRequest: new Date().toISOString(),
        };
        sessions.update(session);
        session = {
            apiKey: 5,
            userId: 6,
            connections: [
                {connId: 56, subscriptions: {"telephones": {name: "Batman"}}},
                {connId: 65, subscriptions: {"config": null}},
            ],
            lastRequest: new Date().toISOString(),
        };
        sessions.update(session);
        let subscribers = sessions.getSubscribers("config");
        assert.notEqual(subscribers, null, "returned null");
        assert.equal(subscribers.length, 2, "subscribers length mismatched");

        subscribers = sessions.getSubscribers("pbx");
        assert.notEqual(subscribers, null, "returned null");
        assert.equal(subscribers.length, 0, "subscribers length must be null");

        subscribers = sessions.getSubscribers("telephones");
        assert.notEqual(subscribers, null, "returned null");
        assert.equal(subscribers.length, 1, "subscribers length mismatched");
        assert.equal(subscribers[0].connId, 56);
        assert.equal(subscribers[0].params.name, "Batman");
    });
});
