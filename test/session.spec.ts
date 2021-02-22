import * as rhea from "rhea";
import { assert } from "chai";
import { Connection, SessionEvents, Session } from "../lib/index";
import { AbortController } from "@azure/abort-controller";
import { abortErrorName } from "../lib/util/utils";

describe("Session", () => {
  let mockService: rhea.Container;
  let mockServiceListener: ReturnType<rhea.Container["listen"]>;
  let connection: Connection;

  beforeEach((done: Function) => {
    mockService = rhea.create_container();
    mockServiceListener = mockService.listen({ port: 0 });
    mockServiceListener.on("listening", async () => {
      connection = new Connection({
        port: mockServiceListener.address().port,
        reconnect: false,
      });
      await connection.open();
      done();
    });
  });

  afterEach(async () => {
    await connection.close();
    mockServiceListener.close();
  });

  it("can be opened and closed", async () => {
    const session = await connection.createSession();
    assert.isTrue(session.isOpen(), "Session should be open.");
    assert.isFalse(session.isClosed(), "Session should not be closed.");
    assert.isFalse(
      session.isItselfClosed(),
      "Session should not be fully closed."
    );

    await session.close();
    assert.isTrue(session.isClosed(), "Session should be closed.");
    assert.isTrue(session.isItselfClosed(), "Session should be fully closed.");
    assert.isFalse(session.isOpen(), "Session should not be open.");
  });

  it("Single disconnected listener shared among all the sessions when close() is called in parallel", async () => {
    const _connection = (connection as any)._connection;
    const getDisconnectListenerCount = () => {
      return _connection.listenerCount(rhea.ConnectionEvents.disconnected);
    };
    const sessionCount = 1000;
    const sessions: Session[] = [];
    const callbackCalledForSessionId: { [key: string]: boolean } = {};
    for (let i = 0; i < sessionCount; i++) {
      const session = await connection.createSession();
      sessions.push(session);
      callbackCalledForSessionId[session.id] = false;
    }
    const disconnectListenerCountBefore = getDisconnectListenerCount();
    await Promise.all(
      sessions
        .map((session) => {
          session.close();
        })
        .concat([
          (() => {
            assert.equal(
              getDisconnectListenerCount(),
              disconnectListenerCountBefore,
              `Unexpected number of "disconnected" listeners - originated from the close() calls`
            );
            assert.equal(
              connection._disconnectEventAudienceMap.size,
              sessionCount,
              `Unexpected number of items in _disconnectEventAudienceMap`
            );
            for (let [
              key,
              callback,
            ] of connection._disconnectEventAudienceMap) {
              connection._disconnectEventAudienceMap.set(
                key,
                (context: rhea.EventContext) => {
                  callbackCalledForSessionId[key] = true;
                  callback(context);
                }
              );
            }
            _connection.emit(rhea.ConnectionEvents.disconnected, {});
          })(),
        ])
    );
    for (const session of sessions) {
      assert.equal(
        callbackCalledForSessionId[session.id as string],
        true,
        `callback not called for ${session.id} - this is unexpected`
      );
    }
    assert.equal(
      getDisconnectListenerCount(),
      disconnectListenerCountBefore,
      `Unexpected number of "disconnected" listeners after sessions were closed`
    );
  });

  it(".remove() removes event listeners", async () => {
    const session = new Session(
      connection,
      connection["_connection"].create_session()
    );

    session.on(SessionEvents.sessionOpen, () => {
      /** no-op */
    });

    assert.isAtLeast(session.listenerCount(SessionEvents.sessionOpen), 1);
    session.remove();
    assert.strictEqual(session.listenerCount(SessionEvents.sessionOpen), 0);
    await session.close();
  });

  it(".close() removes event listeners", async () => {
    const session = new Session(
      connection,
      connection["_connection"].create_session()
    );

    session.on(SessionEvents.sessionOpen, () => {
      /** no-op */
    });

    assert.isAtLeast(session.listenerCount(SessionEvents.sessionOpen), 1);
    await session.close();
    assert.strictEqual(session.listenerCount(SessionEvents.sessionOpen), 0);
  });

  describe("supports events", () => {
    it("sessionOpen", (done: Function) => {
      const session = new Session(
        connection,
        connection["_connection"].create_session()
      );

      session.on(SessionEvents.sessionOpen, async (event) => {
        assert.exists(event, "Expected an AMQP event.");
        assert.isTrue(session.isOpen(), "Expected session to be open.");
        assert.isFalse(
          session.isClosed(),
          "Expected session to not be closed."
        );
        await session.close();
        done();
      });

      // Open the session.
      session.begin();
    });

    it("sessionClose", (done: Function) => {
      const session = new Session(
        connection,
        connection["_connection"].create_session()
      );

      session.on(SessionEvents.sessionOpen, async () => {
        await session.close();
      });

      session.on(SessionEvents.sessionClose, (event) => {
        assert.exists(event, "Expected an AMQP event.");

        done();
      });

      // Open the session.
      session.begin();
    });

    it("sessionError", (done: Function) => {
      const errorCondition = "amqp:connection:forced";
      const errorDescription = "testing error on close";
      mockService.on(
        rhea.SessionEvents.sessionOpen,
        (context: rhea.EventContext) => {
          context.session &&
            context.session.close({
              condition: errorCondition,
              description: errorDescription,
            });
        }
      );

      const session = new Session(
        connection,
        connection["_connection"].create_session()
      );

      session.on(SessionEvents.sessionError, async (event) => {
        assert.exists(event, "Expected an AMQP event.");
        assert.exists(
          event.session,
          "Expected session to be defined on AMQP event."
        );
        if (event.session) {
          const error = event.session.error as rhea.ConnectionError;
          assert.exists(error, "Expected an AMQP error.");
          assert.strictEqual(error.condition, errorCondition);
          assert.strictEqual(error.description, errorDescription);
        }
        await session.close();
        done();
      });

      session.begin();
    });

    it("sessionError on session.close() is bubbled up", (done: Function) => {
      const errorCondition = "amqp:connection:forced";
      const errorDescription = "testing error on close";
      mockService.on(
        rhea.SessionEvents.sessionClose,
        (context: rhea.EventContext) => {
          context.session &&
            context.session.close({
              condition: errorCondition,
              description: errorDescription,
            });
        }
      );

      const session = new Session(
        connection,
        connection["_connection"].create_session()
      );

      session.on(SessionEvents.sessionOpen, async () => {
        try {
          await session.close();
          throw new Error("boo");
        } catch (error) {
          assert.exists(error, "Expected an AMQP error.");
          assert.strictEqual(error.condition, errorCondition);
          assert.strictEqual(error.description, errorDescription);
        }
        done();
      });

      // Open the session.
      session.begin();
    });
  });

  describe("AbortError", () => {
    it("session.close() fails with aborted signal", async () => {
      const connection = new Connection({
        port: mockServiceListener.address().port,
        reconnect: false,
      });

      await connection.open();
      const session = await connection.createSession();
      assert.isTrue(session.isOpen(), "Session should be open.");

      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      // Pass an already aborted signal to close()
      abortController.abort();
      const sessionClosePromise = session.close({ abortSignal });

      let abortErrorThrown = false;
      try {
        await sessionClosePromise;
      } catch (error) {
        abortErrorThrown = error.name === abortErrorName;
      }

      assert.isTrue(abortErrorThrown, "AbortError should have been thrown.");
      assert.isFalse(session.isOpen(), "Session should not be open.");
      assert.isTrue(
        session["_session"].is_remote_open(),
        "Session remote endpoint should not have gotten a chance to close."
      );

      await connection.close();
    });

    it("session.close() fails when abort signal is fired", async () => {
      const connection = new Connection({
        port: mockServiceListener.address().port,
        reconnect: false,
      });

      await connection.open();
      const session = await connection.createSession();
      assert.isTrue(session.isOpen(), "Session should be open.");

      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      // Abort the signal after passing it to open()
      const sessionClosePromise = session.close({ abortSignal });
      abortController.abort();

      let abortErrorThrown = false;
      try {
        await sessionClosePromise;
      } catch (error) {
        abortErrorThrown = error.name === abortErrorName;
      }

      assert.isTrue(abortErrorThrown, "AbortError should have been thrown.");
      assert.isFalse(session.isOpen(), "Session should not be open.");
      assert.isTrue(
        session["_session"].is_remote_open(),
        "Session remote endpoint should not have gotten a chance to close."
      );

      await connection.close();
    });

    it("createSender() fails with aborted signal", async () => {
      const connection = new Connection({
        port: mockServiceListener.address().port,
        reconnect: false,
      });
      await connection.open();
      const session = await connection.createSession();

      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      // Pass an already aborted signal to createSender()
      abortController.abort();
      const createSenderPromise = session.createSender({ abortSignal });

      let abortErrorThrown = false;
      try {
        await createSenderPromise;
      } catch (error) {
        abortErrorThrown = error.name === abortErrorName;
      }

      assert.isTrue(abortErrorThrown, "AbortError should have been thrown.");
      await connection.close();
    });

    it("createSender() fails when abort signal is fired", async () => {
      const connection = new Connection({
        port: mockServiceListener.address().port,
        reconnect: false,
      });
      await connection.open();
      const session = await connection.createSession();

      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      // Abort the signal after passing it to createSender()
      const createSenderPromise = session.createSender({ abortSignal });
      abortController.abort();

      let abortErrorThrown = false;
      try {
        await createSenderPromise;
      } catch (error) {
        abortErrorThrown = error.name === abortErrorName;
      }

      assert.isTrue(abortErrorThrown, "AbortError should have been thrown.");
      await connection.close();
    });

    it("createAwaitableSender() fails with aborted signal", async () => {
      const connection = new Connection({
        port: mockServiceListener.address().port,
        reconnect: false,
      });
      await connection.open();
      const session = await connection.createSession();

      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      // Pass an already aborted signal to createAwaitableSender()
      abortController.abort();
      const createAwaitableSenderPromise = session.createAwaitableSender({
        abortSignal,
      });

      let abortErrorThrown = false;
      try {
        await createAwaitableSenderPromise;
      } catch (error) {
        abortErrorThrown = error.name === abortErrorName;
      }

      assert.isTrue(abortErrorThrown, "AbortError should have been thrown.");
      await connection.close();
    });

    it("createAwaitableSender() fails when abort signal is fired", async () => {
      const connection = new Connection({
        port: mockServiceListener.address().port,
        reconnect: false,
      });
      await connection.open();
      const session = await connection.createSession();

      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      // Abort the signal after passing it to createAwaitableSender()
      const createAwaitableSenderPromise = session.createAwaitableSender({
        abortSignal,
      });
      abortController.abort();

      let abortErrorThrown = false;
      try {
        await createAwaitableSenderPromise;
      } catch (error) {
        abortErrorThrown = error.name === abortErrorName;
      }

      assert.isTrue(abortErrorThrown, "AbortError should have been thrown.");
      await connection.close();
    });

    it("createReceiver() fails with aborted signal", async () => {
      const connection = new Connection({
        port: mockServiceListener.address().port,
        reconnect: false,
      });
      await connection.open();
      const session = await connection.createSession();

      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      // Pass an already aborted signal to createReceiver()
      abortController.abort();
      const createReceiverPromise = session.createReceiver({ abortSignal });

      let abortErrorThrown = false;
      try {
        await createReceiverPromise;
      } catch (error) {
        abortErrorThrown = error.name === abortErrorName;
      }

      assert.isTrue(abortErrorThrown, "AbortError should have been thrown.");
      await connection.close();
    });

    it("createReceiver() fails when abort signal is fired", async () => {
      const connection = new Connection({
        port: mockServiceListener.address().port,
        reconnect: false,
      });
      await connection.open();
      const session = await connection.createSession();

      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      // Abort the signal after passing it to createReceiver()
      const createReceiverPromise = session.createReceiver({ abortSignal });
      abortController.abort();

      let abortErrorThrown = false;
      try {
        await createReceiverPromise;
      } catch (error) {
        abortErrorThrown = error.name === abortErrorName;
      }

      assert.isTrue(abortErrorThrown, "AbortError should have been thrown.");
      await connection.close();
    });
  });
});
