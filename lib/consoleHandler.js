"use strict";

const util = require("util");
const url = require("url");
const winston = require("winston");
const logger = new winston.Logger();

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
        name: "console",
        colorize: !consoleJson,
        timestamp: true,
        level: level,
        stderrLevels: ["error", "warn"],
        json: consoleJson,
        stringify: consoleJson,
    });

    if (process.env.LOGZIO_TOKEN) {
        const logzioWinstonTransport = require("winston-logzio");
        const loggerOptions = {
            token: process.env.LOGZIO_TOKEN,
            host: process.env.LOGZIO_HOST || "listener.logz.io",
            level: level,
            addTimestampWithNanoSecs: true,
        };
        logger.add(logzioWinstonTransport, loggerOptions);
        logger.info("Configured logz.io logger");
    }

    if (process.env.GRAYLOG2_HOST) {
        const WinstonGraylog2 = require("winston-graylog2");
        logger.add(WinstonGraylog2, {
            name: "graylog",
            level: level,
            handleExceptions: true,
            graylog: {
                servers: [{ host: process.env.GRAYLOG2_HOST, port: process.env.GRAYLOG2_PORT || 12201 }],
                hostname: process.env.GRAYLOG2_SOURCE || "blank-node-worker",
                facility: process.env.GRAYLOG2_FACILITY,
                bufferSize: 1400,
            },
        });
    }


    // Override the built-in console methods with winston hooks
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
        if (process.env.BLANK_DEBUG) {
            logger.debug.apply(logger, formatArgs(arguments));
        }
    };
    console.log = console.debug;
};