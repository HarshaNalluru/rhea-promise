"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved.
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
const receiverAddress = process.env.RECEIVER_ADDRESS || "address";
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
        const receiverName = "receiver-1";
        // receive messages from the past one hour
        const filterClause = `amqp.annotation.x-opt-enqueued-time > '${Date.now() - 3600 * 1000}'`;
        const receiverOptions = {
            name: receiverName,
            source: {
                address: receiverAddress,
                filter: {
                    "apache.org:selector-filter:string": lib_1.types.wrap_described(filterClause, 0x468C00000004)
                }
            },
            onSessionError: (context) => {
                const sessionError = context.session && context.session.error;
                if (sessionError) {
                    console.log(">>>>> [%s] An error occurred for session of receiver '%s': %O.", connection.id, receiverName, sessionError);
                }
            }
        };
        yield connection.open();
        const receiver = yield connection.createReceiver(receiverOptions);
        receiver.on(lib_1.ReceiverEvents.message, (context) => {
            console.log("Received message: %O", context.message);
        });
        receiver.on(lib_1.ReceiverEvents.receiverError, (context) => {
            const receiverError = context.receiver && context.receiver.error;
            if (receiverError) {
                console.log(">>>>> [%s] An error occurred for receiver '%s': %O.", connection.id, receiverName, receiverError);
            }
        });
        // sleeping for 2 mins to let the receiver receive messages and then closing it.
        yield lib_1.delay(120000);
        yield receiver.close();
        yield connection.close();
    });
}
main().catch((err) => console.log(err));
//# sourceMappingURL=receive.js.map