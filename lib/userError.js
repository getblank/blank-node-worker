"use strict";

module.exports = function UserError(message) {
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.message = message;
};

require("util").inherits(module.exports, Error);