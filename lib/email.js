"use strict";

let nodemailer = require("nodemailer");
let db = require("./db");
let testEnv = process.env.NODE_ENV === "test";

exports.send = function (message, cb) {
    let d = (typeof cb !== "function") ? new Promise((f, r) => (cb = (e, d) => (setImmediate(() => e != null ? r(e) : f(d))))) : null;
    if (typeof message !== "object") {
        cb(new Error("message must be an object"));
        return d;
    }
    if (testEnv && !message.test) {
        cb();
        return d;
    }
    db.get("emailSettings", "emailSettings", (e, emailSettings) => {
        if (e || emailSettings == null) {
            return cb(new Error("Not found emailSettings in db"));
        }
        let smtpConfig = {
            host: emailSettings.host,
            port: emailSettings.port,
            // secure: true, // use SSL
            auth: {
                user: emailSettings.username,
                pass: emailSettings.password,
            },
        };
        if (emailSettings.port == 465) {
            smtpConfig.secure = true;
        } else {
            smtpConfig.secure = false;
        }
        let transporter = nodemailer.createTransport(smtpConfig);

        let mailOptions = {
            from: emailSettings.from,
            to: message.to,
            subject: message.subject,
            html: message.body,
        };

        if (message.attachments) {
            mailOptions.attachments = message.attachments;
        }

        if (emailSettings.testMode) {
            mailOptions.to = emailSettings.to;
        }

        transporter.sendMail(mailOptions, function (err, info) {
            if (err) {
                console.log(err);
                return cb(err);
            }
            console.log("Message sent: " + info.response);
            cb();
        });
    });
    return d;
};


