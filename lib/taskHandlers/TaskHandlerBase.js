"use strict";

var db = require("../db");

module.exports = class TaskHandlerBase {
    constructor() {
        this.db = db;
        this.test = {
            "setDb": (function (newDb) {
                this.db = newDb;
            }).bind(this),
        };
    }

    run(storeName, user, args, cb) {
    }
};