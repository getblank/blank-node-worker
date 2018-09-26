"use strict";

const db = require("../db");

module.exports = class TaskHandlerBase {
    constructor() {
        this.db = db;
        this.test = {
            setDb: (newDb => {
                this.db = newDb;
            }).bind(this),
        };
    }

    run(storeName, user, args, cb) {}
};
