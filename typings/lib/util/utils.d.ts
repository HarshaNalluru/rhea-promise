import { EventContext as RheaEventContext } from "rhea";
import { Link } from "../link";
import { Session } from "../session";
import { Connection } from "../connection";
/**
 * Defines a mapping for Http like response status codes for different status-code values
 * provided by an AMQP broker.
 * @enum AmqpResponseStatusCode
 */
export declare enum AmqpResponseStatusCode {
    Continue = 100,
    SwitchingProtocols = 101,
    OK = 200,
    Created = 201,
    Accepted = 202,
    NonAuthoritativeInformation = 203,
    NoContent = 204,
    ResetContent = 205,
    PartialContent = 206,
    Ambiguous = 300,
    MultipleChoices = 300,
    Moved = 301,
    MovedPermanently = 301,
    Found = 302,
    Redirect = 302,
    RedirectMethod = 303,
    SeeOther = 303,
    NotModified = 304,
    UseProxy = 305,
    Unused = 306,
    RedirectKeepVerb = 307,
    TemporaryRedirect = 307,
    BadRequest = 400,
    Unauthorized = 401,
    PaymentRequired = 402,
    Forbidden = 403,
    NotFound = 404,
    MethodNotAllowed = 405,
    NotAcceptable = 406,
    ProxyAuthenticationRequired = 407,
    RequestTimeout = 408,
    Conflict = 409,
    Gone = 410,
    LengthRequired = 411,
    PreconditionFailed = 412,
    RequestEntityTooLarge = 413,
    RequestUriTooLong = 414,
    UnsupportedMediaType = 415,
    RequestedRangeNotSatisfiable = 416,
    ExpectationFailed = 417,
    UpgradeRequired = 426,
    InternalServerError = 500,
    NotImplemented = 501,
    BadGateway = 502,
    ServiceUnavailable = 503,
    GatewayTimeout = 504,
    HttpVersionNotSupported = 505
}
/**
 * Provides a list of predefined (amqp) protocol level properties for an amqp message.
 */
export declare const messageProperties: string[];
/**
 * Provides a list of predefined (amqp) protocol level properties for an amqp message header.
 */
export declare const messageHeader: string[];
/**
 * Type declaration for a Function type where T is the input to the function and V is the output of the function.
 */
export declare type Func<T, V> = (a: T) => V;
/**
 * Determines whether the given error object is like an AmqpError object.
 * @param {object} err The AmqpError object
 * @returns {boolean} result - `true` if it is an AMQP Error; `false` otherwise.
 */
export declare function isAmqpError(err: any): boolean;
/**
 * Describes the options that can be provided while parsing connection strings.
 * The connection string usually looks like `{A}={B};{C}={D}`.
 * @interface ConnectionStringParseOptions
 */
export interface ConnectionStringParseOptions {
    /**
     * @property {string} [entitySeperator] Describes the separator that separates different parts/
     * entities in a connection string. Default value `;`.
     */
    entitySeperator?: string;
    /**
     * @property {string} [keyValueSeparator] Describes the separator that separates the key/value
     * pair for an entity/part in a connection string; Default value `=`.
     */
    keyValueSeparator?: string;
}
/**
 * Defines an object with possible properties defined in T.
 * @type ParsedOutput<T>
 */
export declare type ParsedOutput<T> = {
    [P in keyof T]: T[P];
};
/**
 * A wrapper for setTimeout that resolves a promise after t milliseconds.
 * @param {number} t - The number of milliseconds to be delayed.
 * @param {T} value - The value to be resolved with after a timeout of t milliseconds.
 * @returns {Promise<T>} - Resolved promise
 */
export declare function delay<T>(t: number, value?: T): Promise<T>;
/**
 * Parses the connection string and returns an object of type T.
 * @param {string} connectionString The connection string to be parsed.
 * @returns {ParsedOutput<T>} ParsedOutput<T>.
 */
export declare function parseConnectionString<T>(connectionString: string, options?: ConnectionStringParseOptions): ParsedOutput<T>;
/**
 * @ignore
 * Describes the parameters to be provided to the function `emitEvent()`.
 * @interface EmitParameters
 */
export interface EmitParameters {
    rheaContext: RheaEventContext;
    emitter: Link | Session | Connection;
    eventName: string;
    connectionId: string;
    emitterType: "sender" | "receiver" | "session" | "connection";
}
/**
 * @ignore
 * Emits an event.
 * @param params parameters needed to emit an event from one of the rhea-promise objects.
 * @returns void
 */
export declare function emitEvent(params: EmitParameters): void;
export interface AbortSignalLike {
    /**
     * Indicates if the signal has already been aborted.
     */
    readonly aborted: boolean;
    /**
     * Add new "abort" event listener, only support "abort" event.
     */
    addEventListener(type: "abort", listener: (this: AbortSignalLike, ev: any) => any, options?: any): void;
    /**
     * Remove "abort" event listener, only support "abort" event.
     */
    removeEventListener(type: "abort", listener: (this: AbortSignalLike, ev: any) => any, options?: any): void;
}
export declare const abortErrorName = "AbortError";
/**
 * Helper method to return an Error to be used when an operation is cancelled
 * using an AbortSignalLike
 * @param errorMessage
 */
export declare function createAbortError(errorMessage: string): Error;
//# sourceMappingURL=utils.d.ts.map