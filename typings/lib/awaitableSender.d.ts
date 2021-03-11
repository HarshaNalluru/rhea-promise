/// <reference types="node" />
import { Delivery, Message, Sender as RheaSender } from "rhea";
import { BaseSender, BaseSenderOptions } from "./sender";
import { SenderEvents } from "rhea";
import { OnAmqpEvent } from "./eventContext";
import { Session } from "./session";
import { AbortSignalLike } from "./util/utils";
/**
 * Describes the interface for the send operation Promise which contains a reference to resolve,
 * reject functions and the timer for that Promise.
 * @interface PromiseLike
 */
export interface PromiseLike {
    resolve: (value?: any) => void;
    reject: (reason?: any) => void;
    timer: NodeJS.Timer;
}
/**
 * Describes the event listeners that can be added to the AwaitableSender.
 * @interface Sender
 */
export declare interface AwaitableSender {
    on(event: SenderEvents, listener: OnAmqpEvent): this;
}
export interface AwaitableSenderOptions extends BaseSenderOptions {
    /**
     * The duration in which the promise to send the message should complete (resolve/reject).
     * If it is not completed, then the Promise will be rejected after timeout occurs.
     * Default: `20 seconds`.
     */
    sendTimeoutInSeconds?: number;
}
export interface AwaitableSendOptions {
    /**
     * The duration in which the promise to send the message should complete (resolve/reject).
     * If it is not completed, then the Promise will be rejected after timeout occurs.
     * Default: `20 seconds`.
     */
    timeoutInSeconds?: number;
    /**
     * A signal to cancel the send operation. This does not guarantee that the message will not be
     * sent. It only stops listening for an acknowledgement from the remote endpoint.
     */
    abortSignal?: AbortSignalLike;
}
/**
 * Describes the sender where one can await on the message being sent.
 * @class AwaitableSender
 */
export declare class AwaitableSender extends BaseSender {
    /**
     * The duration in which the promise to send the message should complete (resolve/reject).
     * If it is not completed, then the Promise will be rejected after timeout occurs.
     * Default: `20 seconds`.
     */
    sendTimeoutInSeconds: number;
    /**
     * @property {Map<number, PromiseLike} deliveryDispositionMap Maintains a map of delivery of
     * messages that are being sent. It acts as a store for correlating the dispositions received
     * for sent messages.
     */
    deliveryDispositionMap: Map<number, PromiseLike>;
    constructor(session: Session, sender: RheaSender, options?: AwaitableSenderOptions);
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
    send(msg: Message | Buffer, tag?: Buffer | string, format?: number, options?: AwaitableSendOptions): Promise<Delivery>;
}
//# sourceMappingURL=awaitableSender.d.ts.map