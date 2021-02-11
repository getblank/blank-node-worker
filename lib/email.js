"use strict";

const nodemailer = require("nodemailer");
const db = require("./db");
const testEnv = process.env.NODE_ENV === "test";

const send = async (message) => {
    if (typeof message !== "object") {
        throw new Error("message must be an object");
    }
    if (testEnv && !message.test) {
        return;
    }

    let emailSettings;
    try {
        emailSettings = await db.get("emailSettings", "emailSettings");
    } catch (err) {
        throw new Error("Not found emailSettings in db");
    }

    const smtpConfig = {
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

    const transporter = nodemailer.createTransport(smtpConfig);

    const mailOptions = {
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

    const info = await transporter.sendMail(mailOptions);
    console.debug("Message sent: " + info.response);
    return;
};

module.exports = { send };
