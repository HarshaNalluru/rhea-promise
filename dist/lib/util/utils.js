"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the Apache License. See License in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const log = require("../log");
const eventContext_1 = require("../eventContext");
/**
 * Defines a mapping for Http like response status codes for different status-code values
 * provided by an AMQP broker.
 * @enum AmqpResponseStatusCode
 */
var AmqpResponseStatusCode;
(function (AmqpResponseStatusCode) {
    AmqpResponseStatusCode[AmqpResponseStatusCode["Continue"] = 100] = "Continue";
    AmqpResponseStatusCode[AmqpResponseStatusCode["SwitchingProtocols"] = 101] = "SwitchingProtocols";
    AmqpResponseStatusCode[AmqpResponseStatusCode["OK"] = 200] = "OK";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Created"] = 201] = "Created";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Accepted"] = 202] = "Accepted";
    AmqpResponseStatusCode[AmqpResponseStatusCode["NonAuthoritativeInformation"] = 203] = "NonAuthoritativeInformation";
    AmqpResponseStatusCode[AmqpResponseStatusCode["NoContent"] = 204] = "NoContent";
    AmqpResponseStatusCode[AmqpResponseStatusCode["ResetContent"] = 205] = "ResetContent";
    AmqpResponseStatusCode[AmqpResponseStatusCode["PartialContent"] = 206] = "PartialContent";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Ambiguous"] = 300] = "Ambiguous";
    AmqpResponseStatusCode[AmqpResponseStatusCode["MultipleChoices"] = 300] = "MultipleChoices";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Moved"] = 301] = "Moved";
    AmqpResponseStatusCode[AmqpResponseStatusCode["MovedPermanently"] = 301] = "MovedPermanently";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Found"] = 302] = "Found";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Redirect"] = 302] = "Redirect";
    AmqpResponseStatusCode[AmqpResponseStatusCode["RedirectMethod"] = 303] = "RedirectMethod";
    AmqpResponseStatusCode[AmqpResponseStatusCode["SeeOther"] = 303] = "SeeOther";
    AmqpResponseStatusCode[AmqpResponseStatusCode["NotModified"] = 304] = "NotModified";
    AmqpResponseStatusCode[AmqpResponseStatusCode["UseProxy"] = 305] = "UseProxy";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Unused"] = 306] = "Unused";
    AmqpResponseStatusCode[AmqpResponseStatusCode["RedirectKeepVerb"] = 307] = "RedirectKeepVerb";
    AmqpResponseStatusCode[AmqpResponseStatusCode["TemporaryRedirect"] = 307] = "TemporaryRedirect";
    AmqpResponseStatusCode[AmqpResponseStatusCode["BadRequest"] = 400] = "BadRequest";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Unauthorized"] = 401] = "Unauthorized";
    AmqpResponseStatusCode[AmqpResponseStatusCode["PaymentRequired"] = 402] = "PaymentRequired";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Forbidden"] = 403] = "Forbidden";
    AmqpResponseStatusCode[AmqpResponseStatusCode["NotFound"] = 404] = "NotFound";
    AmqpResponseStatusCode[AmqpResponseStatusCode["MethodNotAllowed"] = 405] = "MethodNotAllowed";
    AmqpResponseStatusCode[AmqpResponseStatusCode["NotAcceptable"] = 406] = "NotAcceptable";
    AmqpResponseStatusCode[AmqpResponseStatusCode["ProxyAuthenticationRequired"] = 407] = "ProxyAuthenticationRequired";
    AmqpResponseStatusCode[AmqpResponseStatusCode["RequestTimeout"] = 408] = "RequestTimeout";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Conflict"] = 409] = "Conflict";
    AmqpResponseStatusCode[AmqpResponseStatusCode["Gone"] = 410] = "Gone";
    AmqpResponseStatusCode[AmqpResponseStatusCode["LengthRequired"] = 411] = "LengthRequired";
    AmqpResponseStatusCode[AmqpResponseStatusCode["PreconditionFailed"] = 412] = "PreconditionFailed";
    AmqpResponseStatusCode[AmqpResponseStatusCode["RequestEntityTooLarge"] = 413] = "RequestEntityTooLarge";
    AmqpResponseStatusCode[AmqpResponseStatusCode["RequestUriTooLong"] = 414] = "RequestUriTooLong";
    AmqpResponseStatusCode[AmqpResponseStatusCode["UnsupportedMediaType"] = 415] = "UnsupportedMediaType";
    AmqpResponseStatusCode[AmqpResponseStatusCode["RequestedRangeNotSatisfiable"] = 416] = "RequestedRangeNotSatisfiable";
    AmqpResponseStatusCode[AmqpResponseStatusCode["ExpectationFailed"] = 417] = "ExpectationFailed";
    AmqpResponseStatusCode[AmqpResponseStatusCode["UpgradeRequired"] = 426] = "UpgradeRequired";
    AmqpResponseStatusCode[AmqpResponseStatusCode["InternalServerError"] = 500] = "InternalServerError";
    AmqpResponseStatusCode[AmqpResponseStatusCode["NotImplemented"] = 501] = "NotImplemented";
    AmqpResponseStatusCode[AmqpResponseStatusCode["BadGateway"] = 502] = "BadGateway";
    AmqpResponseStatusCode[AmqpResponseStatusCode["ServiceUnavailable"] = 503] = "ServiceUnavailable";
    AmqpResponseStatusCode[AmqpResponseStatusCode["GatewayTimeout"] = 504] = "GatewayTimeout";
    AmqpResponseStatusCode[AmqpResponseStatusCode["HttpVersionNotSupported"] = 505] = "HttpVersionNotSupported";
})(AmqpResponseStatusCode = exports.AmqpResponseStatusCode || (exports.AmqpResponseStatusCode = {}));
/**
 * Provides a list of predefined (amqp) protocol level properties for an amqp message.
 */
exports.messageProperties = [
    "message_id", "reply_to", "to", "correlation_id", "content_type", "absolute_expiry_time",
    "group_id", "group_sequence", "reply_to_group_id", "content_encoding", "creation_time", "subject",
    "user_id"
];
/**
 * Provides a list of predefined (amqp) protocol level properties for an amqp message header.
 */
exports.messageHeader = [
    "first_acquirer", "delivery_count", "ttl", "durable", "priority"
];
/**
 * Determines whether the given error object is like an AmqpError object.
 * @param {object} err The AmqpError object
 * @returns {boolean} result - `true` if it is an AMQP Error; `false` otherwise.
 */
function isAmqpError(err) {
    if (!err || typeof err !== "object") {
        throw new Error("err is a required parameter and must be of type 'object'.");
    }
    let result = false;
    if (((err.condition && typeof err.condition === "string") && (err.description && typeof err.description === "string"))
        || (err.value && Array.isArray(err.value))
        || (err.constructor && err.constructor.name === "c")) {
        result = true;
    }
    return result;
}
exports.isAmqpError = isAmqpError;
/**
 * A wrapper for setTimeout that resolves a promise after t milliseconds.
 * @param {number} t - The number of milliseconds to be delayed.
 * @param {T} value - The value to be resolved with after a timeout of t milliseconds.
 * @returns {Promise<T>} - Resolved promise
 */
function delay(t, value) {
    return new Promise((resolve) => setTimeout(() => resolve(value), t));
}
exports.delay = delay;
/**
 * Parses the connection string and returns an object of type T.
 * @param {string} connectionString The connection string to be parsed.
 * @returns {ParsedOutput<T>} ParsedOutput<T>.
 */
function parseConnectionString(connectionString, options) {
    if (!options)
        options = {};
    const entitySeperator = options.entitySeperator || ";";
    const keyValueSeparator = options.keyValueSeparator || "=";
    return connectionString.split(entitySeperator).reduce((acc, part) => {
        const splitIndex = part.indexOf(keyValueSeparator);
        return Object.assign({}, acc, { [part.substring(0, splitIndex)]: part.substring(splitIndex + 1) });
    }, {});
}
exports.parseConnectionString = parseConnectionString;
/**
 * @ignore
 * Emits an event.
 * @param params parameters needed to emit an event from one of the rhea-promise objects.
 * @returns void
 */
function emitEvent(params) {
    const emit = () => {
        const id = params.emitter &&
            (params.emitter.id || params.emitter.name);
        log[params.emitterType]("[%s] %s '%s' got event: '%s'. Re-emitting the translated context.", params.connectionId, params.emitterType, id, params.eventName);
        params.emitter.emit(params.eventName, eventContext_1.EventContext.translate(params.rheaContext, params.emitter, params.eventName));
    };
    if (params.eventName.indexOf("error") !== -1 && params.emitter.actionInitiated > 0) {
        log[params.emitterType]("[%s] %s got event: '%s'. Will re-emit in the next tick, since " +
            "this happened before the promise for create/close was resolved.", params.connectionId, params.emitterType, params.eventName);
        // setTimeout() without any time is equivalent to process.nextTick() and works in node.js and
        // browsers. We wait for a tick to emit error events in general. This should give enough
        // time for promises to resolve on *_open (create) and *_close (close).
        setTimeout(emit);
    }
    else {
        emit();
    }
}
exports.emitEvent = emitEvent;
exports.abortErrorName = "AbortError";
/**
 * Helper method to return an Error to be used when an operation is cancelled
 * using an AbortSignalLike
 * @param errorMessage
 */
function createAbortError(errorMessage) {
    const error = new Error(errorMessage);
    error.name = exports.abortErrorName;
    return error;
}
exports.createAbortError = createAbortError;
//# sourceMappingURL=utils.js.map