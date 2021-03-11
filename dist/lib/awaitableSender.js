"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the Apache License. See License in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const rhea_1 = require("rhea");
const log = require("./log");
const sender_1 = require("./sender");
const rhea_2 = require("rhea");
const errorDefinitions_1 = require("./errorDefinitions");
const utils_1 = require("./util/utils");
/**
 * Describes the sender where one can await on the message being sent.
 * @class AwaitableSender
 */
class AwaitableSender extends sender_1.BaseSender {
    constructor(session, sender, options = {}) {
        super(session, sender, options);
        /**
         * @property {Map<number, PromiseLike} deliveryDispositionMap Maintains a map of delivery of
         * messages that are being sent. It acts as a store for correlating the dispositions received
         * for sent messages.
         */
        this.deliveryDispositionMap = new Map();
        this.sendTimeoutInSeconds = options.sendTimeoutInSeconds || 20;
        /**
         * The handler that will be added on the Sender for `accepted` event. If the delivery id is
         * present in the disposition map then it will clear the timer and resolve the promise with the
         * delivery.
         * @param delivery Delivery associated with message that was sent.
         */
        const onSendSuccess = (delivery) => {
            const id = delivery.id;
            if (this.deliveryDispositionMap.has(delivery.id)) {
                const promise = this.deliveryDispositionMap.get(id);
                clearTimeout(promise.timer);
                const deleteResult = this.deliveryDispositionMap.delete(id);
                log.sender("[%s] Event: 'Accepted', Successfully deleted the delivery with id %d from " +
                    "the map of sender '%s' on amqp session '%s' and cleared the timer: %s.", this.connection.id, id, this.name, this.session.id, deleteResult);
                return promise.resolve(delivery);
            }
        };
        /**
         * The handler is added on the Sender for `rejected`, `released` and `modified` events.
         * If the delivery is found in the disposition map then the timer will be cleared and the
         * promise will be rejected with an appropriate error message.
         * @param eventName Name of the event that was raised.
         * @param id Delivery id.
         * @param error Error from the context if any.
         */
        const onSendFailure = (eventName, id, error) => {
            if (this.deliveryDispositionMap.has(id)) {
                const promise = this.deliveryDispositionMap.get(id);
                clearTimeout(promise.timer);
                const deleteResult = this.deliveryDispositionMap.delete(id);
                log.sender("[%s] Event: '%s', Successfully deleted the delivery with id %d from the " +
                    " map of sender '%s' on amqp session '%s' and cleared the timer: %s.", this.connection.id, eventName, id, this.name, this.session.id, deleteResult);
                const msg = `Sender '${this.name}' on amqp session '${this.session.id}', received a ` +
                    `'${eventName}' disposition. Hence we are rejecting the promise.`;
                const err = new errorDefinitions_1.SendOperationFailedError(msg, eventName, error);
                log.error("[%s] %s", this.connection.id, msg);
                return promise.reject(err);
            }
        };
        /**
         * The handler that will be added on the Sender link for `sender_error` and on it's underlying
         * session for `session_error` event. These events are raised when the sender link or it's
         * underlying session get disconnected.
         * The handler will clear the timer and reject the promise for every pending send in the map.
         * @param eventName Name of the event that was raised.
         * @param error Error from the context if any
         */
        const onError = (eventName, error) => {
            for (const id of this.deliveryDispositionMap.keys()) {
                onSendFailure(eventName, id, error);
            }
        };
        this.on(rhea_2.SenderEvents.accepted, (context) => {
            onSendSuccess(context.delivery);
        });
        this.on(rhea_2.SenderEvents.rejected, (context) => {
            const delivery = context.delivery;
            onSendFailure(rhea_2.SenderEvents.rejected, delivery.id, delivery.remote_state && delivery.remote_state.error);
        });
        this.on(rhea_2.SenderEvents.released, (context) => {
            const delivery = context.delivery;
            onSendFailure(rhea_2.SenderEvents.released, delivery.id, delivery.remote_state && delivery.remote_state.error);
        });
        this.on(rhea_2.SenderEvents.modified, (context) => {
            const delivery = context.delivery;
            onSendFailure(rhea_2.SenderEvents.modified, delivery.id, delivery.remote_state && delivery.remote_state.error);
        });
        // The user may have it's custom reconnect logic for bringing the sender link back online and
        // retry logic for sending messages on failures hence they can provide their error handlers
        // for `sender_error` and `session_error`.
        // If the user did not provide its error handler for `sender_error` and `session_error`,
        // then we add our handlers and make sure we clear the timer and reject the promise for sending
        // messages with appropriate Error.
        if (!options.onError) {
            this.on(rhea_2.SenderEvents.senderError, (context) => {
                onError(rhea_2.SenderEvents.senderError, context.sender.error);
            });
        }
        if (!options.onSessionError) {
            this.session.on(rhea_1.SessionEvents.sessionError, (context) => {
                onError(rhea_1.SessionEvents.sessionError, context.session.error);
            });
        }
    }
    /**
     * Sends the message on which one can await to ensure that the message has been successfully
     * delivered.
     * @param {Message | Buffer} msg The message to be sent. For default AMQP format msg parameter
     * should be of type Message interface. For a custom format, the msg parameter should be a Buffer
     * and a valid value should be passed to the `format` argument.
     * @param {Buffer | string} [tag] The message tag if any.
     * @param {number} [format] The message format. Specify this if a message with custom format needs
     * to be sent. `0` implies the standard AMQP 1.0 defined format. If no value is provided, then the
     * given message is assumed to be of type Message interface and encoded appropriately.
     * @param {AwaitableSendOptions} [options] Options to configure the timeout and cancellation for
     * the send operation.
     * @returns {Promise<Delivery>} Promise<Delivery> The delivery information about the sent message.
     */
    send(msg, tag, format, options) {
        return new Promise((resolve, reject) => {
            log.sender("[%s] Sender '%s' on amqp session '%s', credit: %d available: %d", this.connection.id, this.name, this.session.id, this.credit, this.session.outgoing.available());
            const abortSignal = options && options.abortSignal;
            const timeoutInSeconds = options && options.timeoutInSeconds;
            if (abortSignal && abortSignal.aborted) {
                const err = utils_1.createAbortError("Send request has been cancelled.");
                log.error("[%s] %s", this.connection.id, err.message);
                return reject(err);
            }
            if (this.sendable()) {
                let sendTimeoutInSeconds = this.sendTimeoutInSeconds;
                if (typeof timeoutInSeconds === "number" && timeoutInSeconds > 0)
                    sendTimeoutInSeconds = timeoutInSeconds;
                const timer = setTimeout(() => {
                    this.deliveryDispositionMap.delete(delivery.id);
                    const message = `Sender '${this.name}' on amqp session ` +
                        `'${this.session.id}', with address '${this.address}' was not able to send the ` +
                        `message with delivery id ${delivery.id} right now, due to operation timeout.`;
                    log.error("[%s] %s", this.connection.id, message);
                    return reject(new errorDefinitions_1.OperationTimeoutError(message));
                }, sendTimeoutInSeconds * 1000);
                const onAbort = () => {
                    if (this.deliveryDispositionMap.has(delivery.id)) {
                        const promise = this.deliveryDispositionMap.get(delivery.id);
                        clearTimeout(promise.timer);
                        const deleteResult = this.deliveryDispositionMap.delete(delivery.id);
                        log.sender("[%s] Event: 'abort', Successfully deleted the delivery with id %d from the " +
                            " map of sender '%s' on amqp session '%s' and cleared the timer: %s.", this.connection.id, delivery.id, this.name, this.session.id, deleteResult);
                        const err = utils_1.createAbortError("Send request has been cancelled.");
                        log.error("[%s] %s", this.connection.id, err.message);
                        promise.reject(err);
                    }
                };
                const removeAbortListener = () => {
                    if (abortSignal) {
                        abortSignal.removeEventListener("abort", onAbort);
                    }
                };
                const delivery = this._link.send(msg, tag, format);
                this.deliveryDispositionMap.set(delivery.id, {
                    resolve: (delivery) => {
                        resolve(delivery);
                        removeAbortListener();
                    },
                    reject: (reason) => {
                        reject(reason);
                        removeAbortListener();
                    },
                    timer: timer
                });
                if (abortSignal) {
                    abortSignal.addEventListener("abort", onAbort);
                }
            }
            else {
                // Please send the message after some time.
                const msg = `Sender "${this.name}" on amqp session "${this.session.id}", with address ` +
                    `${this.address} cannot send the message right now as it does not have ` +
                    `enough credit. Please try later.`;
                log.error("[%s] %s", this.connection.id, msg);
                reject(new errorDefinitions_1.InsufficientCreditError(msg));
            }
        });
    }
}
exports.AwaitableSender = AwaitableSender;
//# sourceMappingURL=awaitableSender.js.map