"use strict";

import nodemailer from "nodemailer";
import db from "./db";

exports.send = function (message, cb) {
    if (message && typeof message === "object") {
        db.get("emailSettings", "emailSettings", (e, emailSettings) => {
            if (e || emailSettings === null) {
                return cb(new Error("Not found emailSettings in db"));
            }
            var smtpConfig = {
                host: emailSettings.host,
                port: emailSettings.port,
                secure: true, // use SSL
                auth: {
                    user: emailSettings.username,
                    pass: emailSettings.password,
                },
            };
            var transporter = nodemailer.createTransport(smtpConfig);

            var mailOptions = {
                from: emailSettings.from,
                to: message.to,
                subject: message.subject,
                html: message.body,
            };

            if (message.attachments) {
                mailOptions = message.attachments;
            }

            if (emailSettings.testMode) {
                mailOptions.to = emailSettings.to;
            }

            transporter.sendMail(mailOptions, function (error, info) {
                if (error) {
                    return console.log(error);
                }
                console.log("Message sent: " + info.response);
                cb();
            });
        });
    } else {
        return cb(new Error("WRONG MESSAGE"));
    }
};


