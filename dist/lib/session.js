"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the Apache License. See License in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const log = require("./log");
const receiver_1 = require("./receiver");
const sender_1 = require("./sender");
const rhea_1 = require("rhea");
const utils_1 = require("./util/utils");
const entity_1 = require("./entity");
const errorDefinitions_1 = require("./errorDefinitions");
const awaitableSender_1 = require("./awaitableSender");
/**
 * @internal
 */
var SenderType;
(function (SenderType) {
    SenderType["sender"] = "sender";
    SenderType["AwaitableSender"] = "AwaitableSender";
})(SenderType || (SenderType = {}));
/**
 * Describes the session that wraps the rhea session.
 * @class Session
 */
class Session extends entity_1.Entity {
    constructor(connection, session) {
        super();
        this._connection = connection;
        this._session = session;
        this._initializeEventListeners();
    }
    /**
     * @property {Connection} connection The underlying AMQP connection.
     * @readonly
     */
    get connection() {
        return this._connection;
    }
    get incoming() {
        return this._session.incoming;
    }
    get outgoing() {
        return this._session.outgoing;
    }
    get error() {
        return this._session.error;
    }
    /**
     * Returns the unique identifier for the session in the format:
     * "local_<number>-remote_<number>-<connection-id>" or an empty string if the local channel or
     * remote channel are not yet defined.
     */
    get id() {
        let result = "";
        const session = this._session;
        if (session.local) {
            result += `local-${session.local.channel}_`;
        }
        if (session.remote) {
            result += `remote-${session.remote.channel}_`;
        }
        if (result) {
            result += `${this._connection.id}`;
        }
        return result;
    }
    /**
     * Determines whether the session and the underlying connection is open.
     * @returns {boolean} result `true` - is open; `false` otherwise.
     */
    isOpen() {
        let result = false;
        if (this._connection.isOpen() && this._session.is_open()) {
            result = true;
        }
        return result;
    }
    /**
     * Determines whether the close from the peer is a response to a locally initiated close request.
     * @returns {boolean} `true` if close was locally initiated, `false` otherwise.
     */
    isClosed() {
        return this._session.is_closed();
    }
    /**
     * Determines whether both local and remote endpoint for just the session itself are closed.
     * Within the "session_close" event handler, if this method returns `false` it means that
     * the local end is still open. It can be useful to determine whether the close
     * was initiated locally under such circumstances.
     *
     * @returns {boolean} `true` - closed, `false` otherwise.
     */
    isItselfClosed() {
        return this._session.is_itself_closed();
    }
    /**
     * Removes the underlying amqp session from the internal map in rhea.
     * Also removes all the event handlers added in the rhea-promise library on the session.
     */
    remove() {
        if (this._session) {
            // Remove our listeners and listeners from rhea's 'session' object.
            this.removeAllListeners();
            this._session.removeAllListeners();
            this._session.remove();
        }
    }
    begin() {
        if (this._session) {
            this._session.begin();
        }
    }
    /**
     * Closes the underlying amqp session in rhea if open. Also removes all the event
     * handlers added in the rhea-promise library on the session
     * @param options A set of options including a signal used to cancel the operation.
     * When the abort signal in the options is fired, the local endpoint is closed.
     * This does not guarantee that the remote has closed as well. It only stops listening for
     * an acknowledgement that the remote endpoint is closed as well.
     * @return {Promise<void>} Promise<void>
     * - **Resolves** the promise when rhea emits the "session_close" event.
     * - **Rejects** the promise with an AmqpError when rhea emits the "session_error" event while trying
     * to close an amqp session or with an AbortError if the operation was cancelled.
     */
    close(options) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const closePromise = new Promise((resolve, reject) => {
                log.error("[%s] The amqp session '%s' is open ? -> %s", this.connection.id, this.id, this.isOpen());
                if (this.isOpen()) {
                    let onError;
                    let onClose;
                    let onDisconnected;
                    let onAbort;
                    const abortSignal = options && options.abortSignal;
                    let waitTimer;
                    const removeListeners = () => {
                        clearTimeout(waitTimer);
                        this.actionInitiated--;
                        this._session.removeListener(rhea_1.SessionEvents.sessionError, onError);
                        this._session.removeListener(rhea_1.SessionEvents.sessionClose, onClose);
                        this._session.connection.removeListener(rhea_1.ConnectionEvents.disconnected, onDisconnected);
                        if (abortSignal) {
                            abortSignal.removeEventListener("abort", onAbort);
                        }
                    };
                    onClose = (context) => {
                        removeListeners();
                        log.session("[%s] Resolving the promise as the amqp session '%s' has been closed.", this.connection.id, this.id);
                        return resolve();
                    };
                    onError = (context) => {
                        removeListeners();
                        log.error("[%s] Error occurred while closing amqp session '%s'.", this.connection.id, this.id, context.session.error);
                        reject(context.session.error);
                    };
                    onDisconnected = (context) => {
                        removeListeners();
                        const error = context.connection && context.connection.error
                            ? context.connection.error
                            : context.error;
                        log.error("[%s] Connection got disconnected while closing amqp session '%s': %O.", this.connection.id, this.id, error);
                    };
                    onAbort = () => {
                        removeListeners();
                        const err = utils_1.createAbortError("Session close request has been cancelled.");
                        log.error("[%s] [%s]", this.connection.id, err.message);
                        return reject(err);
                    };
                    const actionAfterTimeout = () => {
                        removeListeners();
                        const msg = `Unable to close the amqp session ${this.id} due to operation timeout.`;
                        log.error("[%s] %s", this.connection.id, msg);
                        reject(new errorDefinitions_1.OperationTimeoutError(msg));
                    };
                    // listeners that we add for completing the operation are added directly to rhea's objects.
                    this._session.once(rhea_1.SessionEvents.sessionClose, onClose);
                    this._session.once(rhea_1.SessionEvents.sessionError, onError);
                    this._session.connection.once(rhea_1.ConnectionEvents.disconnected, onDisconnected);
                    log.session("[%s] Calling session.close() for amqp session '%s'.", this.connection.id, this.id);
                    waitTimer = setTimeout(actionAfterTimeout, this.connection.options.operationTimeoutInSeconds * 1000);
                    this._session.close();
                    this.actionInitiated++;
                    if (abortSignal) {
                        if (abortSignal.aborted) {
                            onAbort();
                        }
                        else {
                            abortSignal.addEventListener("abort", onAbort);
                        }
                    }
                }
                else {
                    return resolve();
                }
            });
            try {
                yield closePromise;
            }
            finally {
                this.removeAllListeners();
            }
        });
    }
    /**
     * Creates an amqp receiver on this session.
     * @param session The amqp session object on which the receiver link needs to be established.
     * @param options Options that can be provided while creating an amqp receiver.
     * @return Promise<Receiver>
     * - **Resolves** the promise with the Receiver object when rhea emits the "receiver_open" event.
     * - **Rejects** the promise with an AmqpError when rhea emits the "receiver_close" event while trying
     * to create an amqp receiver or the operation timeout occurs.
     */
    createReceiver(options) {
        return new Promise((resolve, reject) => {
            if (options &&
                ((options.onMessage && !options.onError) || (options.onError && !options.onMessage))) {
                if (options.credit_window !== 0) {
                    // - If the 'onMessage' handler is not provided and the credit_window is not set to 0,
                    // then messages may be lost between the receiver link getting created and the message
                    // handler being attached.
                    // - It can be possible for a service to initially accept the link attach, which would
                    // cause the promise to resolve. However, moments later the service may send a detach
                    // due to some internal or configuration issue. If no error handler is attached, then
                    // the error may fall through.
                    // - Hence it is advised to either provide both 'onMessage' and 'onError' handlers, or
                    // please set the credit_window to `0`, if you want to provide only the 'onError' handler.
                    return reject(new Error("Either provide both 'onMessage' and 'onError' handlers, or pl" +
                        "ease set the credit_window to 0, if you want to provide only the 'onError' " +
                        "handler. This ensures no messages are lost between the receiver getting created " +
                        " and the 'onMessage' handler being added."));
                }
            }
            // Register session handlers for session_error and session_close if provided.
            // listeners provided by the user in the options object should be added
            // to our (rhea-promise) object.
            if (options && options.onSessionError) {
                this.on(rhea_1.SessionEvents.sessionError, options.onSessionError);
                log.session("[%s] Added event handler for event '%s' on rhea-promise 'session: %s', " +
                    "while creating the 'receiver'.", this.connection.id, rhea_1.SessionEvents.sessionError, this.id);
            }
            if (options && options.onSessionClose) {
                this.on(rhea_1.SessionEvents.sessionClose, options.onSessionClose);
                log.session("[%s] Added event handler for event '%s' on rhea-promise 'session: %s', " +
                    " while creating the 'receiver'.", this.connection.id, rhea_1.SessionEvents.sessionClose, this.id);
            }
            const rheaReceiver = this._session.attach_receiver(options);
            const receiver = new receiver_1.Receiver(this, rheaReceiver, options);
            receiver.actionInitiated++;
            let onOpen;
            let onClose;
            let onDisconnected;
            let onAbort;
            const abortSignal = options && options.abortSignal;
            let waitTimer;
            if (options && options.onMessage) {
                receiver.on(rhea_1.ReceiverEvents.message, options.onMessage);
                log.receiver("[%s] Added event handler for event '%s' on rhea-promise 'receiver'.", this.connection.id, rhea_1.ReceiverEvents.message);
            }
            if (options && options.onError) {
                receiver.on(rhea_1.ReceiverEvents.receiverError, options.onError);
                log.receiver("[%s] Added event handler for event '%s' on rhea-promise 'receiver'.", this.connection.id, rhea_1.ReceiverEvents.receiverError);
            }
            if (options && options.onClose) {
                receiver.on(rhea_1.ReceiverEvents.receiverClose, options.onClose);
                log.receiver("[%s] Added event handler for event '%s' on rhea-promise 'receiver'.", this.connection.id, rhea_1.ReceiverEvents.receiverClose);
            }
            if (options && options.onSettled) {
                receiver.on(rhea_1.ReceiverEvents.settled, options.onSettled);
                log.receiver("[%s] Added event handler for event '%s' on rhea-promise 'receiver'.", this.connection.id, rhea_1.ReceiverEvents.settled);
            }
            const removeListeners = () => {
                clearTimeout(waitTimer);
                receiver.actionInitiated--;
                rheaReceiver.removeListener(rhea_1.ReceiverEvents.receiverOpen, onOpen);
                rheaReceiver.removeListener(rhea_1.ReceiverEvents.receiverClose, onClose);
                rheaReceiver.session.connection.removeListener(rhea_1.ConnectionEvents.disconnected, onDisconnected);
                if (abortSignal) {
                    abortSignal.removeEventListener("abort", onAbort);
                }
            };
            onOpen = (context) => {
                removeListeners();
                log.receiver("[%s] Resolving the promise with amqp receiver '%s' on amqp session '%s'.", this.connection.id, receiver.name, this.id);
                return resolve(receiver);
            };
            onClose = (context) => {
                removeListeners();
                log.error("[%s] Error occurred while creating the amqp receiver '%s' on amqp session " +
                    "'%s' over amqp connection: %O.", this.connection.id, receiver.name, this.id, context.receiver.error);
                return reject(context.receiver.error);
            };
            onDisconnected = (context) => {
                removeListeners();
                const error = context.connection && context.connection.error
                    ? context.connection.error
                    : context.error;
                log.error("[%s] Connection got disconnected while creating amqp receiver '%s' on amqp " +
                    "session '%s': %O.", this.connection.id, receiver.name, this.id, error);
                return reject(error);
            };
            onAbort = () => {
                removeListeners();
                rheaReceiver.close();
                const err = utils_1.createAbortError("Create receiver request has been cancelled.");
                log.error("[%s] [%s]", this.connection.id, err.message);
                return reject(err);
            };
            const actionAfterTimeout = () => {
                removeListeners();
                const msg = `Unable to create the amqp receiver '${receiver.name}' on amqp ` +
                    `session '${this.id}' due to operation timeout.`;
                log.error("[%s] %s", this.connection.id, msg);
                return reject(new errorDefinitions_1.OperationTimeoutError(msg));
            };
            // listeners that we add for completing the operation are added directly to rhea's objects.
            rheaReceiver.once(rhea_1.ReceiverEvents.receiverOpen, onOpen);
            rheaReceiver.once(rhea_1.ReceiverEvents.receiverClose, onClose);
            rheaReceiver.session.connection.on(rhea_1.ConnectionEvents.disconnected, onDisconnected);
            waitTimer = setTimeout(actionAfterTimeout, this.connection.options.operationTimeoutInSeconds * 1000);
            if (abortSignal) {
                if (abortSignal.aborted) {
                    onAbort();
                }
                else {
                    abortSignal.addEventListener("abort", onAbort);
                }
            }
        });
    }
    /**
     * Creates an amqp sender on this session.
     * @param options Options that can be provided while creating an amqp sender.
     * @return Promise<Sender>
     * - **Resolves** the promise with the Sender object when rhea emits the "sender_open" event.
     * - **Rejects** the promise with an AmqpError when rhea emits the "sender_close" event while trying
     * to create an amqp sender or the operation timeout occurs.
     */
    createSender(options) {
        return this._createSender(SenderType.sender, options);
    }
    /**
     * Creates an awaitable amqp sender on this session.
     * @param options Options that can be provided while creating an async amqp sender.
     * - If `onError` and `onSessionError` handlers are not provided then the `AwaitableSender` will
     * clear the timer and reject the Promise for all the entries of inflight send operation in its
     * `deliveryDispositionMap`.
     * - If the user is handling the reconnection of sender link or the underlying connection in it's
     * app, then the `onError` and `onSessionError` handlers must be provided by the user and (s)he
     * shall be responsible of clearing the `deliveryDispotionMap` of inflight `send()` operation.
     *
     * @return Promise<AwaitableSender>
     * - **Resolves** the promise with the Sender object when rhea emits the "sender_open" event.
     * - **Rejects** the promise with an AmqpError when rhea emits the "sender_close" event while trying
     * to create an amqp sender or the operation timeout occurs.
     */
    createAwaitableSender(options) {
        return this._createSender(SenderType.AwaitableSender, options);
    }
    /**
     * Creates the Sender based on the provided type.
     * @internal
     * @param type The type of sender
     * @param options Options to be provided while creating the sender.
     */
    _createSender(type, options) {
        return new Promise((resolve, reject) => {
            // Register session handlers for session_error and session_close if provided.
            if (options && options.onSessionError) {
                this.on(rhea_1.SessionEvents.sessionError, options.onSessionError);
                log.session("[%s] Added event handler for event '%s' on rhea-promise 'session: %s', " +
                    "while creating the sender.", this.connection.id, rhea_1.SessionEvents.sessionError, this.id);
            }
            if (options && options.onSessionClose) {
                this.on(rhea_1.SessionEvents.sessionClose, options.onSessionClose);
                log.session("[%s] Added event handler for event '%s' on rhea-promise 'session: %s', " +
                    "while creating the sender.", this.connection.id, rhea_1.SessionEvents.sessionClose, this.id);
            }
            const rheaSender = this._session.attach_sender(options);
            let sender;
            if (type === SenderType.sender) {
                sender = new sender_1.Sender(this, rheaSender, options);
            }
            else {
                sender = new awaitableSender_1.AwaitableSender(this, rheaSender, options);
            }
            sender.actionInitiated++;
            let onSendable;
            let onClose;
            let onDisconnected;
            let onAbort;
            const abortSignal = options && options.abortSignal;
            let waitTimer;
            // listeners provided by the user in the options object should be added
            // to our (rhea-promise) object.
            if (options) {
                if (options.onError) {
                    sender.on(rhea_1.SenderEvents.senderError, options.onError);
                }
                if (options.onClose) {
                    sender.on(rhea_1.SenderEvents.senderClose, options.onClose);
                }
                if (type === SenderType.sender) {
                    if (options.onAccepted) {
                        sender.on(rhea_1.SenderEvents.accepted, options.onAccepted);
                    }
                    if (options.onRejected) {
                        sender.on(rhea_1.SenderEvents.rejected, options.onRejected);
                    }
                    if (options.onReleased) {
                        sender.on(rhea_1.SenderEvents.released, options.onReleased);
                    }
                    if (options.onModified) {
                        sender.on(rhea_1.SenderEvents.modified, options.onModified);
                    }
                }
            }
            const removeListeners = () => {
                clearTimeout(waitTimer);
                sender.actionInitiated--;
                rheaSender.removeListener(rhea_1.SenderEvents.senderOpen, onSendable);
                rheaSender.removeListener(rhea_1.SenderEvents.senderClose, onClose);
                rheaSender.session.connection.removeListener(rhea_1.ConnectionEvents.disconnected, onDisconnected);
                if (abortSignal) {
                    abortSignal.removeEventListener("abort", onAbort);
                }
            };
            onSendable = (context) => {
                removeListeners();
                log.sender("[%s] Resolving the promise with amqp sender '%s' on amqp session '%s'.", this.connection.id, sender.name, this.id);
                return resolve(sender);
            };
            onClose = (context) => {
                removeListeners();
                log.error("[%s] Error occurred while creating the amqp sender '%s' on amqp session '%s' " +
                    "over amqp connection: %O.", this.connection.id, sender.name, this.id, context.sender.error);
                return reject(context.sender.error);
            };
            onDisconnected = (context) => {
                removeListeners();
                const error = context.connection && context.connection.error
                    ? context.connection.error
                    : context.error;
                log.error("[%s] Connection got disconnected while creating amqp sender '%s' on amqp " +
                    "session '%s': %O.", this.connection.id, sender.name, this.id, error);
                return reject(error);
            };
            onAbort = () => {
                removeListeners();
                rheaSender.close();
                const err = utils_1.createAbortError("Create sender request has been cancelled.");
                log.error("[%s] [%s]", this.connection.id, err.message);
                return reject(err);
            };
            const actionAfterTimeout = () => {
                removeListeners();
                const msg = `Unable to create the amqp sender '${sender.name}' on amqp session ` +
                    `'${this.id}' due to operation timeout.`;
                log.error("[%s] %s", this.connection.id, msg);
                return reject(new errorDefinitions_1.OperationTimeoutError(msg));
            };
            // listeners that we add for completing the operation are added directly to rhea's objects.
            rheaSender.once(rhea_1.SenderEvents.sendable, onSendable);
            rheaSender.once(rhea_1.SenderEvents.senderClose, onClose);
            rheaSender.session.connection.on(rhea_1.ConnectionEvents.disconnected, onDisconnected);
            waitTimer = setTimeout(actionAfterTimeout, this.connection.options.operationTimeoutInSeconds * 1000);
            if (abortSignal) {
                if (abortSignal.aborted) {
                    onAbort();
                }
                else {
                    abortSignal.addEventListener("abort", onAbort);
                }
            }
        });
    }
    /**
     * Adds event listeners for the possible events that can occur on the session object and
     * re-emits the same event back with the received arguments from rhea's event emitter.
     * @private
     * @returns {void} void
     */
    _initializeEventListeners() {
        for (const eventName of Object.keys(rhea_1.SessionEvents)) {
            this._session.on(rhea_1.SessionEvents[eventName], (context) => {
                const params = {
                    rheaContext: context,
                    emitter: this,
                    eventName: rhea_1.SessionEvents[eventName],
                    emitterType: "session",
                    connectionId: this.connection.id
                };
                utils_1.emitEvent(params);
            });
        }
        // Add event handlers for *_error and *_close events that can be propagated to the session
        // object, if they are not handled at their level. * denotes - Sender and Receiver.
        // Sender
        this._session.on(rhea_1.SenderEvents.senderError, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.SenderEvents.senderError,
                emitterType: "session",
                connectionId: this.connection.id
            };
            utils_1.emitEvent(params);
        });
        this._session.on(rhea_1.SenderEvents.senderClose, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.SenderEvents.senderClose,
                emitterType: "session",
                connectionId: this.connection.id
            };
            utils_1.emitEvent(params);
        });
        // Receiver
        this._session.on(rhea_1.ReceiverEvents.receiverError, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.ReceiverEvents.receiverError,
                emitterType: "session",
                connectionId: this.connection.id
            };
            utils_1.emitEvent(params);
        });
        this._session.on(rhea_1.ReceiverEvents.receiverClose, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.ReceiverEvents.receiverClose,
                emitterType: "session",
                connectionId: this.connection.id
            };
            utils_1.emitEvent(params);
        });
        if (typeof this._session.eventNames === "function") {
            log.eventHandler("[%s] rhea-promise 'session' object '%s' is listening for events: %o " +
                "emitted by rhea's 'session' object.", this.connection.id, this.id, this._session.eventNames());
        }
    }
}
exports.Session = Session;
//# sourceMappingURL=session.js.map