import { describe, expect, it, vi } from "vitest";
import { createLocalTerminalSocket } from "../../src/backend/local-terminal";
import { FakeSocket } from "./socket-fakes";

function fakePty() {
  const data = new Set<(d: string) => void>();
  const exit = new Set<(c: number) => void>();
  return {
    pid: 1,
    shell: "/bin/bash",
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (h: (d: string) => void) => {
      data.add(h);
      return () => data.delete(h);
    },
    onExit: (h: (c: number) => void) => {
      exit.add(h);
      return () => exit.delete(h);
    },
    emitData: (d: string) => data.forEach((h) => h(d)),
    emitExit: (c: number) => exit.forEach((h) => h(c)),
  };
}

function setup(options: { available?: boolean; userId?: string } = {}) {
  const pty = fakePty();
  const spawn = vi.fn(async () => pty);
  const ctx = {
    desktop: {
      local: {
        available: () => options.available ?? true,
        pty: { spawn },
      },
    },
  } as never;
  const socket = new FakeSocket();
  const connection = {
    userId: options.userId ?? "u1",
    socket,
    request: { url: "/plugin-ws/ssh-terminal/local-terminal?cols=100&rows=30" },
  } as never;
  const handler = createLocalTerminalSocket(ctx);
  return { pty, spawn, socket, connection, handler };
}

describe("local terminal socket", () => {
  it("refuses a socket without a user", async () => {
    const { handler, connection, socket, spawn } = setup({ userId: "" });
    await handler.handleConnection(connection);
    expect(spawn).not.toHaveBeenCalled();
    expect(socket.closedWith).toBe(1008);
  });

  it("refuses outside the desktop app", async () => {
    const { handler, connection, socket, spawn } = setup({ available: false });
    await handler.handleConnection(connection);
    expect(spawn).not.toHaveBeenCalled();
    expect(socket.closedWith).toBe(1008);
    expect(socket.messages()[0]).toMatchObject({ type: "error" });
  });

  it("starts a shell with the requested size and buffers until ready", async () => {
    const { handler, connection, socket, pty, spawn } = setup();
    await handler.handleConnection(connection);
    expect(spawn).toHaveBeenCalledWith({
      cols: 100,
      rows: 30,
      shell: undefined,
    });
    expect(socket.messages()[0]).toMatchObject({ type: "started" });

    pty.emitData("early");
    expect(socket.messages().some((m) => m.type === "data")).toBe(false);
    socket.emit("message", Buffer.from(JSON.stringify({ type: "ready" })));
    expect(socket.messages().at(-1)).toEqual({ type: "data", data: "early" });
    pty.emitData("later");
    expect(socket.messages().at(-1)).toEqual({ type: "data", data: "later" });
  });

  it("clamps the size and ignores oversized input", async () => {
    const { handler, connection, socket, pty, spawn } = setup();
    (connection as { request: { url: string } }).request.url =
      "/x?cols=9999&rows=0";
    await handler.handleConnection(connection);
    expect(spawn).toHaveBeenCalledWith({
      cols: 80,
      rows: 24,
      shell: undefined,
    });

    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "input", data: "x".repeat(64 * 1024 + 1) }),
      ),
    );
    expect(pty.write).not.toHaveBeenCalled();
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "input", data: "ls\n" })),
    );
    expect(pty.write).toHaveBeenCalledWith("ls\n");
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "resize", cols: 120, rows: 40 })),
    );
    expect(pty.resize).toHaveBeenCalledWith(120, 40);
  });

  it("kills the shell when the socket closes and closes the socket on exit", async () => {
    const first = setup();
    await first.handler.handleConnection(first.connection);
    first.socket.close();
    expect(first.pty.kill).toHaveBeenCalled();

    const second = setup();
    await second.handler.handleConnection(second.connection);
    second.pty.emitExit(3);
    expect(second.socket.messages().at(-1)).toEqual({
      type: "exit",
      exitCode: 3,
    });
    expect(second.socket.closedWith).toBe(1000);
  });

  it("reports a spawn failure", async () => {
    const { handler, connection, socket, spawn } = setup();
    spawn.mockRejectedValueOnce(new Error("no pty"));
    await handler.handleConnection(connection);
    expect(socket.messages()[0]).toEqual({ type: "error", message: "no pty" });
    expect(socket.closedWith).toBe(1011);
  });

  it("closeAll closes open sockets", async () => {
    const { handler, connection, socket } = setup();
    await handler.handleConnection(connection);
    handler.closeAll();
    expect(socket.closedWith).toBe(1001);
  });
});
