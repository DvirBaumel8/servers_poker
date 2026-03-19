/**
 * ws.ts — Zero-dependency WebSocket server
 *
 * Uses Node's built-in http 'upgrade' event to handle WebSocket handshake
 * and framing per RFC 6455. Supports text frames only (sufficient for JSON).
 *
 * Usage:
 *   import { createWsServer } from './ws';
 *   const wss = createWsServer(httpServer);
 *   wss.on('connection', (socket, tableId) => { ... });
 *   wss.broadcast(tableId, jsonObject);
 *   wss.send(socket, jsonObject);
 */

import * as crypto from "crypto";
import { EventEmitter } from "events";
import type { Server as HttpServer } from "http";
import type { Socket } from "net";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

interface ParsedFrame {
  opcode: number;
  payload: Buffer;
  consumed: number;
}

export interface WsSocket extends EventEmitter {
  socket: Socket;
  readyState: number;
  subscribe: (tableId: string | null) => void;
  send: (data: string | object) => void;
  close: () => void;
}

export interface WsServer extends EventEmitter {
  broadcast: (tableId: string, data: object) => void;
  clientCount: (tableId: string) => number;
  totalClients: () => number;
}

function acceptKey(key: string): string {
  return crypto
    .createHash("sha1")
    .update(key + GUID)
    .digest("base64");
}

/**
 * Parse a single WebSocket frame from a buffer
 * Returns { opcode, payload, consumed } or null if incomplete
 */
function parseFrame(buf: Buffer): ParsedFrame | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + payloadLen) return null;

  let payload = buf.slice(offset + maskLen, offset + maskLen + payloadLen);
  if (masked) {
    const mask = buf.slice(offset, offset + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }

  return { opcode, payload, consumed: offset + maskLen + payloadLen };
}

/**
 * Build a WebSocket text frame (server → client, unmasked)
 */
function buildFrame(data: string): Buffer {
  const payload = Buffer.from(data, "utf8");
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function buildCloseFrame(): Buffer {
  return Buffer.from([0x88, 0x00]);
}

function buildPongFrame(payload: Buffer): Buffer {
  const buf = Buffer.alloc(2 + payload.length);
  buf[0] = 0x8a;
  buf[1] = payload.length;
  payload.copy(buf, 2);
  return buf;
}

class WsSocketImpl extends EventEmitter implements WsSocket {
  socket: Socket;
  readyState: number;
  private _buf: Buffer;
  subscribe!: (tableId: string | null) => void;

  constructor(socket: Socket) {
    super();
    this.socket = socket;
    this.readyState = 1; // OPEN
    this._buf = Buffer.alloc(0);

    socket.on("data", (chunk: Buffer) => {
      this._buf = Buffer.concat([this._buf, chunk]);
      this._processFrames();
    });

    socket.on("close", () => {
      this.readyState = 3;
      this.emit("close");
    });

    socket.on("error", (err: Error) => {
      this.readyState = 3;
      this.emit("error", err);
    });
  }

  private _processFrames(): void {
    while (true) {
      const frame = parseFrame(this._buf);
      if (!frame) break;
      this._buf = this._buf.slice(frame.consumed);

      if (frame.opcode === 0x8) {
        // close
        this.close();
        break;
      } else if (frame.opcode === 0x9) {
        // ping
        this.socket.write(buildPongFrame(frame.payload));
      } else if (frame.opcode === 0x1) {
        // text
        this.emit("message", frame.payload.toString("utf8"));
      }
    }
  }

  send(data: string | object): void {
    if (this.readyState !== 1) return;
    try {
      this.socket.write(
        buildFrame(typeof data === "string" ? data : JSON.stringify(data)),
      );
    } catch {
      // Ignore write errors
    }
  }

  close(): void {
    if (this.readyState !== 1) return;
    this.readyState = 2;
    try {
      this.socket.write(buildCloseFrame());
    } catch {
      // Ignore write errors
    }
    this.socket.end();
  }
}

export function createWsServer(httpServer: HttpServer): WsServer {
  const emitter = new EventEmitter() as WsServer;
  const clients = new Map<string, Set<WsSocket>>();

  httpServer.on("upgrade", (req, socket: Socket) => {
    const url = new URL(req.url || "", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = acceptKey(key);
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    const ws = new WsSocketImpl(socket);
    const tableId = url.searchParams.get("table") || null;

    ws.subscribe = (tid: string | null): void => {
      clients.forEach((set) => set.delete(ws));
      if (tid) {
        if (!clients.has(tid)) clients.set(tid, new Set());
        clients.get(tid)!.add(ws);
      }
    };

    ws.on("close", () => {
      clients.forEach((set) => set.delete(ws));
    });

    if (tableId) ws.subscribe(tableId);
    emitter.emit("connection", ws, tableId);
  });

  emitter.broadcast = (tableId: string, data: object): void => {
    const set = clients.get(tableId);
    if (!set) return;
    set.forEach((ws) => {
      if (ws.readyState === 1) ws.send(data);
      else set.delete(ws);
    });
  };

  emitter.clientCount = (tableId: string): number => {
    return clients.get(tableId)?.size || 0;
  };

  emitter.totalClients = (): number => {
    let n = 0;
    clients.forEach((s) => (n += s.size));
    return n;
  };

  return emitter;
}
