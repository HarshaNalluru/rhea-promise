"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the Apache License. See License in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const log = require("./log");
const session_1 = require("./session");
const container_1 = require("./container");
const constants_1 = require("./util/constants");
const utils_1 = require("./util/utils");
const rhea_1 = require("rhea");
const entity_1 = require("./entity");
const errorDefinitions_1 = require("./errorDefinitions");
// Determines whether the given object is a CreatedRheConnectionOptions object.
function isCreatedRheaConnectionOptions(obj) {
    return (obj && typeof obj.container === "object" && typeof obj.rheaConnection === "object");
}
/**
 * Describes the AMQP Connection.
 * @class Connection
 */
class Connection extends entity_1.Entity {
    /**
     * Creates an instance of the Connection object.
     * @constructor
     * @param {Connection} _connection The connection object from rhea library.
     */
    constructor(options) {
        super();
        if (!options)
            options = {};
        if (options.operationTimeoutInSeconds == undefined) {
            options.operationTimeoutInSeconds = constants_1.defaultOperationTimeoutInSeconds;
        }
        if (isCreatedRheaConnectionOptions(options)) {
            this._connection = options.rheaConnection;
            this.container = options.container;
        }
        else {
            const connectionOptions = options;
            if (connectionOptions.webSocketOptions) {
                const ws = rhea_1.websocket_connect(connectionOptions.webSocketOptions.webSocket);
                connectionOptions.connection_details = ws(connectionOptions.webSocketOptions.url, connectionOptions.webSocketOptions.protocol, connectionOptions.webSocketOptions.options);
            }
            this._connection = rhea_1.create_connection(connectionOptions);
            this.container = container_1.Container.copyFromContainerInstance(this._connection.container);
        }
        this.options = this._connection.options;
        this.options.operationTimeoutInSeconds = options.operationTimeoutInSeconds;
        this._initializeEventListeners();
    }
    /**
     * @property {string} id Returns the connection id.
     * @readonly
     */
    get id() {
        return this._connection.options.id;
    }
    /**
     * @property {Dictionary<any> | undefined} [properties] Provides the connection properties.
     * @readonly
     */
    get properties() {
        return this._connection.properties;
    }
    /**
     * @property {number | undefined} [maxFrameSize] Provides the max frame size.
     * @readonly
     */
    get maxFrameSize() {
        return this._connection.max_frame_size;
    }
    /**
     * @property {number | undefined} [idleTimeout] Provides the idle timeout for the connection.
     * @readonly
     */
    get idleTimeout() {
        return this._connection.idle_time_out;
    }
    /**
     * @property {number | undefined} [channelMax] Provides the maximum number of channels supported.
     * @readonly
     */
    get channelMax() {
        return this._connection.channel_max;
    }
    /**
     * @property {AmqpError | Error | undefined} [error] Provides the last error that occurred on the
     * connection.
     */
    get error() {
        return this._connection.error;
    }
    /**
     * Removes the provided session from the internal map in rhea.
     * Also removes all the event handlers added in the rhea-promise library on the provided session.
     * @param {Session} session The session to be removed.
     */
    removeSession(session) {
        return session.remove();
    }
    /**
     * Creates a new amqp connection.
     * @param options A set of options including a signal used to cancel the operation.
     * @return {Promise<Connection>} Promise<Connection>
     * - **Resolves** the promise with the Connection object when rhea emits the "connection_open" event.
     * - **Rejects** the promise with an AmqpError when rhea emits the "connection_close" event
     * while trying to establish an amqp connection or with an AbortError if the operation was cancelled.
     */
    open(options) {
        return new Promise((resolve, reject) => {
            if (!this.isOpen()) {
                let onOpen;
                let onClose;
                let onAbort;
                const abortSignal = options && options.abortSignal;
                let waitTimer;
                const removeListeners = () => {
                    clearTimeout(waitTimer);
                    this.actionInitiated--;
                    this._connection.removeListener(rhea_1.ConnectionEvents.connectionOpen, onOpen);
                    this._connection.removeListener(rhea_1.ConnectionEvents.connectionClose, onClose);
                    this._connection.removeListener(rhea_1.ConnectionEvents.disconnected, onClose);
                    if (abortSignal) {
                        abortSignal.removeEventListener("abort", onAbort);
                    }
                };
                onOpen = (context) => {
                    removeListeners();
                    log.connection("[%s] Resolving the promise with amqp connection.", this.id);
                    return resolve(this);
                };
                onClose = (context) => {
                    removeListeners();
                    const err = context.error || context.connection.error || Error('Failed to connect');
                    log.error("[%s] Error occurred while establishing amqp connection: %O", this.id, err);
                    return reject(err);
                };
                onAbort = () => {
                    removeListeners();
                    this._connection.close();
                    const err = utils_1.createAbortError("Connection open request has been cancelled.");
                    log.error("[%s] [%s]", this.id, err.message);
                    return reject(err);
                };
                const actionAfterTimeout = () => {
                    removeListeners();
                    const msg = `Unable to open the amqp connection "${this.id}" due to operation timeout.`;
                    log.error("[%s] %s", this.id, msg);
                    return reject(new Error(msg));
                };
                // listeners that we add for completing the operation are added directly to rhea's objects.
                this._connection.once(rhea_1.ConnectionEvents.connectionOpen, onOpen);
                this._connection.once(rhea_1.ConnectionEvents.connectionClose, onClose);
                this._connection.once(rhea_1.ConnectionEvents.disconnected, onClose);
                waitTimer = setTimeout(actionAfterTimeout, this.options.operationTimeoutInSeconds * 1000);
                log.connection("[%s] Trying to create a new amqp connection.", this.id);
                this._connection.connect();
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
                return resolve(this);
            }
        });
    }
    /**
     * Closes the amqp connection.
     * @param options A set of options including a signal used to cancel the operation.
     * When the abort signal in the options is fired, the local endpoint is closed.
     * This does not guarantee that the remote has closed as well. It only stops listening for
     * an acknowledgement that the remote endpoint is closed as well.
     * @return {Promise<void>} Promise<void>
     * - **Resolves** the promise when rhea emits the "connection_close" event.
     * - **Rejects** the promise with an AmqpError when rhea emits the "connection_error" event while
     * trying to close an amqp connection or with an AbortError if the operation was cancelled.
     */
    close(options) {
        return new Promise((resolve, reject) => {
            log.error("[%s] The connection is open ? -> %s", this.id, this.isOpen());
            if (this.isOpen()) {
                let onClose;
                let onError;
                let onDisconnected;
                let onAbort;
                const abortSignal = options && options.abortSignal;
                let waitTimer;
                const removeListeners = () => {
                    clearTimeout(waitTimer);
                    this.actionInitiated--;
                    this._connection.removeListener(rhea_1.ConnectionEvents.connectionError, onError);
                    this._connection.removeListener(rhea_1.ConnectionEvents.connectionClose, onClose);
                    this._connection.removeListener(rhea_1.ConnectionEvents.disconnected, onDisconnected);
                    if (abortSignal) {
                        abortSignal.removeEventListener("abort", onAbort);
                    }
                };
                onClose = (context) => {
                    removeListeners();
                    log.connection("[%s] Resolving the promise as the connection has been successfully closed.", this.id);
                    return resolve();
                };
                onError = (context) => {
                    removeListeners();
                    log.error("[%s] Error occurred while closing amqp connection: %O.", this.id, context.connection.error);
                    return reject(context.connection.error);
                };
                onDisconnected = (context) => {
                    removeListeners();
                    const error = context.connection && context.connection.error
                        ? context.connection.error
                        : context.error;
                    log.error("[%s] Connection got disconnected while closing itself: %O.", this.id, error);
                };
                onAbort = () => {
                    removeListeners();
                    const err = utils_1.createAbortError("Connection close request has been cancelled.");
                    log.error("[%s] [%s]", this.id, err.message);
                    return reject(err);
                };
                const actionAfterTimeout = () => {
                    removeListeners();
                    const msg = `Unable to close the amqp connection "${this.id}" due to operation timeout.`;
                    log.error("[%s] %s", this.id, msg);
                    return reject(new Error(msg));
                };
                // listeners that we add for completing the operation are added directly to rhea's objects.
                this._connection.once(rhea_1.ConnectionEvents.connectionClose, onClose);
                this._connection.once(rhea_1.ConnectionEvents.connectionError, onError);
                this._connection.once(rhea_1.ConnectionEvents.disconnected, onDisconnected);
                waitTimer = setTimeout(actionAfterTimeout, this.options.operationTimeoutInSeconds * 1000);
                this._connection.close();
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
    }
    /**
     * Determines whether the connection is open.
     * @returns {boolean} result `true` - is open; `false` otherwise.
     */
    isOpen() {
        let result = false;
        if (this._connection && this._connection.is_open && this._connection.is_open()) {
            result = true;
        }
        return result;
    }
    /**
     * Clears all the amqp sessions from the internal map maintained in rhea. This does not remove any
     * of the event handlers added in the rhea-promise library. To clear such event handlers, either
     * call remove() or close() on each session
     */
    removeAllSessions() {
        if (this._connection) {
            this._connection.remove_all_sessions();
        }
    }
    /**
     * Determines whether the remote end of the connection is open.
     * @returns {boolean} result `true` - is open; `false` otherwise.
     */
    isRemoteOpen() {
        return this._connection.is_remote_open();
    }
    /**
     * Gets the connection error if present.
     * @returns {ConnectionError | undefined} ConnectionError | undefined
     */
    getError() {
        return this._connection.get_error();
    }
    /**
     * Gets the peer certificate if present.
     * @returns {PeerCertificate | undefined} PeerCertificate | undefined
     */
    getPeerCertificate() {
        return this._connection.get_peer_certificate();
    }
    /**
     * Gets the tls socket if present.
     * @returns {Socket | undefined} Socket | undefined
     */
    getTlsSocket() {
        return this._connection.get_tls_socket();
    }
    /**
     * Determines whether the close from the peer is a response to a locally initiated close request
     * for the connection.
     * @returns {boolean} `true` if close was locally initiated, `false` otherwise.
     */
    wasCloseInitiated() {
        return this._connection.is_closed();
    }
    /**
     * Creates an amqp session on the provided amqp connection.
     * @param options A set of options including a signal used to cancel the operation.
     * @return {Promise<Session>} Promise<Session>
     * - **Resolves** the promise with the Session object when rhea emits the "session_open" event.
     * - **Rejects** the promise with an AmqpError when rhea emits the "session_close" event while
     * trying to create an amqp session or with an AbortError if the operation was cancelled.
     */
    createSession(options) {
        return new Promise((resolve, reject) => {
            const rheaSession = this._connection.create_session();
            const session = new session_1.Session(this, rheaSession);
            session.actionInitiated++;
            let onOpen;
            let onClose;
            let onDisconnected;
            let onAbort;
            const abortSignal = options && options.abortSignal;
            let waitTimer;
            const removeListeners = () => {
                clearTimeout(waitTimer);
                session.actionInitiated--;
                rheaSession.removeListener(rhea_1.SessionEvents.sessionOpen, onOpen);
                rheaSession.removeListener(rhea_1.SessionEvents.sessionClose, onClose);
                rheaSession.connection.removeListener(rhea_1.ConnectionEvents.disconnected, onDisconnected);
                if (abortSignal) {
                    abortSignal.removeEventListener("abort", onAbort);
                }
            };
            onOpen = (context) => {
                removeListeners();
                log.session("[%s] Resolving the promise with amqp session '%s'.", this.id, session.id);
                return resolve(session);
            };
            onClose = (context) => {
                removeListeners();
                log.error("[%s] Error occurred while establishing a session over amqp connection: %O.", this.id, context.session.error);
                return reject(context.session.error);
            };
            onDisconnected = (context) => {
                removeListeners();
                const error = context.connection && context.connection.error
                    ? context.connection.error
                    : context.error;
                log.error("[%s] Connection got disconnected while creating amqp session '%s': %O.", this.id, session.id, error);
                return reject(error);
            };
            onAbort = () => {
                removeListeners();
                rheaSession.close();
                const err = utils_1.createAbortError("Create session request has been cancelled.");
                log.error("[%s] [%s]", this.id, err.message);
                return reject(err);
            };
            const actionAfterTimeout = () => {
                removeListeners();
                const msg = `Unable to create the amqp session due to operation timeout.`;
                log.error("[%s] %s", this.id, msg);
                return reject(new errorDefinitions_1.OperationTimeoutError(msg));
            };
            // listeners that we add for completing the operation are added directly to rhea's objects.
            rheaSession.once(rhea_1.SessionEvents.sessionOpen, onOpen);
            rheaSession.once(rhea_1.SessionEvents.sessionClose, onClose);
            rheaSession.connection.once(rhea_1.ConnectionEvents.disconnected, onDisconnected);
            log.session("[%s] Calling amqp session.begin().", this.id);
            waitTimer = setTimeout(actionAfterTimeout, this.options.operationTimeoutInSeconds * 1000);
            rheaSession.begin();
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
     * Creates an amqp sender link. It either uses the provided session or creates a new one.
     * - **Resolves** the promise with the Sender object when rhea emits the "sender_open" event.
     * - **Rejects** the promise with an AmqpError when rhea emits the "sender_close" event while
     * trying to create an amqp session or with an AbortError if the operation was cancelled.
     * @param {SenderOptionsWithSession} options Optional parameters to create a sender link.
     * @return {Promise<Sender>} Promise<Sender>.
     */
    createSender(options) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (options && options.session && options.session.createSender) {
                return options.session.createSender(options);
            }
            const session = yield this.createSession({ abortSignal: options && options.abortSignal });
            return session.createSender(options);
        });
    }
    /**
     * Creates an awaitable amqp sender. It either uses the provided session or creates a new one.
     * @param options Optional parameters to create an awaitable sender link.
     * - If `onError` and `onSessionError` handlers are not provided then the `AwaitableSender` will
     * clear the timer and reject the Promise for all the entries of inflight send operation in its
     * `deliveryDispositionMap`.
     * - If the user is handling the reconnection of sender link or the underlying connection in it's
     * app, then the `onError` and `onSessionError` handlers must be provided by the user and (s)he
     * shall be responsible of clearing the `deliveryDispositionMap` of inflight `send()` operation.
     *
     * @return Promise<AwaitableSender>.
     */
    createAwaitableSender(options) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (options && options.session && options.session.createAwaitableSender) {
                return options.session.createAwaitableSender(options);
            }
            const session = yield this.createSession({ abortSignal: options && options.abortSignal });
            return session.createAwaitableSender(options);
        });
    }
    /**
     * Creates an amqp receiver link. It either uses the provided session or creates a new one.
     * - **Resolves** the promise with the Sender object when rhea emits the "receiver_open" event.
     * - **Rejects** the promise with an AmqpError when rhea emits the "receiver_close" event while
     * trying to create an amqp session or with an AbortError if the operation was cancelled.
     * @param {ReceiverOptionsWithSession} options Optional parameters to create a receiver link.
     * @return {Promise<Receiver>} Promise<Receiver>.
     */
    createReceiver(options) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (options && options.session && options.session.createReceiver) {
                return options.session.createReceiver(options);
            }
            const session = yield this.createSession({ abortSignal: options && options.abortSignal });
            return session.createReceiver(options);
        });
    }
    /**
     * Creates an amqp sender-receiver link. It either uses the provided session or creates a new one.
     * This method creates a sender-receiver link on the same session. It is useful for management
     * style operations where one may want to send a request and await for response.
     * @param {SenderOptions} senderOptions Parameters to create a sender.
     * @param {ReceiverOptions} receiverOptions Parameters to create a receiver.
     * @param {Session} [session] The optional session on which the sender and receiver links will be
     * created.
     * @return {Promise<ReqResLink>} Promise<ReqResLink>
     */
    createRequestResponseLink(senderOptions, receiverOptions, providedSession, abortSignal) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!senderOptions) {
                throw new Error(`Please provide sender options.`);
            }
            if (!receiverOptions) {
                throw new Error(`Please provide receiver options.`);
            }
            const session = providedSession || (yield this.createSession({ abortSignal }));
            const [sender, receiver] = yield Promise.all([
                session.createSender(Object.assign({}, senderOptions, { abortSignal })),
                session.createReceiver(Object.assign({}, receiverOptions, { abortSignal }))
            ]);
            log.connection("[%s] Successfully created the sender '%s' and receiver '%s' on the same " +
                "amqp session '%s'.", this.id, sender.name, receiver.name, session.id);
            return {
                session: session,
                sender: sender,
                receiver: receiver
            };
        });
    }
    /**
     * Adds event listeners for the possible events that can occur on the connection object and
     * re-emits the same event back with the received arguments from rhea's event emitter.
     * @private
     * @returns {void} void
     */
    _initializeEventListeners() {
        for (const eventName of Object.keys(rhea_1.ConnectionEvents)) {
            this._connection.on(rhea_1.ConnectionEvents[eventName], (context) => {
                const params = {
                    rheaContext: context,
                    emitter: this,
                    eventName: rhea_1.ConnectionEvents[eventName],
                    emitterType: "connection",
                    connectionId: this.id
                };
                if (rhea_1.ConnectionEvents[eventName] === rhea_1.ConnectionEvents.protocolError) {
                    log.connection("[%s] ProtocolError is: %O.", this.id, context);
                }
                utils_1.emitEvent(params);
            });
        }
        // Add event handlers for *_error and *_close events that can be propagated to the connection
        // object, if they are not handled at their level. * denotes - Sender, Receiver, Session
        // Sender
        this._connection.on(rhea_1.SenderEvents.senderError, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.SenderEvents.senderError,
                emitterType: "connection",
                connectionId: this.id
            };
            utils_1.emitEvent(params);
        });
        this._connection.on(rhea_1.SenderEvents.senderClose, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.SenderEvents.senderClose,
                emitterType: "connection",
                connectionId: this.id
            };
            utils_1.emitEvent(params);
        });
        // Receiver
        this._connection.on(rhea_1.ReceiverEvents.receiverError, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.ReceiverEvents.receiverError,
                emitterType: "connection",
                connectionId: this.id
            };
            utils_1.emitEvent(params);
        });
        this._connection.on(rhea_1.ReceiverEvents.receiverClose, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.ReceiverEvents.receiverClose,
                emitterType: "connection",
                connectionId: this.id
            };
            utils_1.emitEvent(params);
        });
        // Session
        this._connection.on(rhea_1.SessionEvents.sessionError, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.SessionEvents.sessionError,
                emitterType: "connection",
                connectionId: this.id
            };
            utils_1.emitEvent(params);
        });
        this._connection.on(rhea_1.SessionEvents.sessionClose, (context) => {
            const params = {
                rheaContext: context,
                emitter: this,
                eventName: rhea_1.SessionEvents.sessionClose,
                emitterType: "connection",
                connectionId: this.id
            };
            utils_1.emitEvent(params);
        });
        if (typeof this._connection.eventNames === "function") {
            log.eventHandler("[%s] rhea-promise 'connection' object is listening for events: %o " +
                "emitted by rhea's 'connection' object.", this.id, this._connection.eventNames());
        }
    }
}
exports.Connection = Connection;
//# sourceMappingURL=connection.js.map