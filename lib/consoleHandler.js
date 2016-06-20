"use strict";

var util = require("util");
var winston = require("winston");
let logger = new winston.Logger();

function formatArgs(args) {
    return [util.format.apply(util.format, Array.prototype.slice.call(args))];
}

module.exports.setup = function (level) {
    level = level || "info";
    let consoleJson = false;
    switch ((process.env.NODE_ENV || "").toLowerCase()) {
        case "production":
            consoleJson = true;
            // logger.add(winston.transports.File, {
            //     filename: __dirname + "/application.log",
            //     handleExceptions: true,
            //     exitOnError: false,
            //     level: "warn",
            // });
            break;
        case "test":
            // Don't set up the logger overrides
            break;
    }
    logger.add(winston.transports.Console, {
        colorize: !consoleJson,
        timestamp: true,
        level: level,
        stderrLevels: ["error", "warn"],
        json: consoleJson,
        stringify: consoleJson,
    });

    // Override the built-in console methods with winston hooks
    console.log = function () {
        logger.info.apply(logger, formatArgs(arguments));
    };
    console.info = function () {
        logger.info.apply(logger, formatArgs(arguments));
    };
    console.warn = function () {
        logger.warn.apply(logger, formatArgs(arguments));
    };
    console.error = function () {
        logger.error.apply(logger, formatArgs(arguments));
    };
    console.debug = function () {
        logger.debug.apply(logger, formatArgs(arguments));
    };
};