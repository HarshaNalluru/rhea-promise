"use strict";
//  Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the Apache License. See License in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const lib_1 = require("../lib");
const dotenv = require("dotenv"); // Optional for loading environment configuration from a .env (config) file
dotenv.config();
const host = process.env.AMQP_HOST || "host";
const username = process.env.AMQP_USERNAME || "sharedAccessKeyName";
const password = process.env.AMQP_PASSWORD || "sharedAccessKeyValue";
const port = parseInt(process.env.AMQP_PORT || "5671");
const senderAddress = process.env.SENDER_ADDRESS || "address";
function main() {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const connectionOptions = {
            transport: "tls",
            host: host,
            hostname: host,
            username: username,
            password: password,
            port: port,
            reconnect: false
        };
        const connection = new lib_1.Connection(connectionOptions);
        const senderName = "sender-1";
        const senderOptions = {
            name: senderName,
            target: {
                address: senderAddress
            },
            sendTimeoutInSeconds: 10
        };
        yield connection.open();
        const sender = yield connection.createAwaitableSender(senderOptions);
        for (let i = 0; i < 10; i++) {
            const message = {
                body: `Hello World - ${i}`,
                message_id: i
            };
            // Please, note that we are awaiting on sender.send() to complete.
            // You will notice that `delivery.settled` will be `true`, irrespective of whether the promise resolves or rejects.
            const delivery = yield sender.send(message);
            console.log("[%s] await sendMessage -> Delivery id: %d, settled: %s", connection.id, delivery.id, delivery.settled);
        }
        yield sender.close();
        yield connection.close();
    });
}
main().catch((err) => console.log(err));
//# sourceMappingURL=awaitableSend.js.map