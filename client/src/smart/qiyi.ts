/*
 * QIYI SMART CUBES over Bluetooth (QY-QYSC smart cubes, X-Man Tornado V4 AI...).
 *
 * The protocol follows csTimer's QiYi driver (cs0x7f/cstimer, qiyicube.js),
 * which works with current QiYi firmware:
 *   - every message is AES-128 encrypted (one fixed key), with a CRC-16/MODBUS
 *   - after connecting, the app sends a "hello" carrying the cube's MAC address;
 *     the cube answers with its full state and battery
 *   - each turn comes with the cube's own timestamp, the state after it, and the
 *     last few turns (so turns Bluetooth lost can be recovered)
 *   - every message from the cube is acknowledged, or it stops sending
 * The MAC comes from the cube's advertisement when the browser allows it, else
 * from its name (QY-QYSC-S-6BE1 -> CC:A3:00:00:6B:E1), else the player types it.
 */

import { SOLVED_FACELETS, type Facelets } from "@cube-racing/shared/cube3";

const SERVICE = 0xfff0;
const CHARACTERISTIC = 0xfff6;
/** QiYi's company id in the advertisement's manufacturer data (holds the MAC). */
const QIYI_CIC = 0x0504;
const KEY = new Uint8Array([87, 177, 249, 171, 205, 90, 232, 167, 156, 185, 140, 231, 87, 140, 81, 8]);
/** Cube timestamps count in units of 1/1.6 ms. */
const TIMESTAMP_SCALE = 1.6;

export const QIYI_NAME_PREFIXES = ["QY-QYSC", "XMD-TornadoV4-i", "QY-", "XMD-"];

export interface QiyiEvents {
  /** A turn: "R", "U'"... `cubeAt` is the cube's clock (ms); `recovered` = Bluetooth had lost it. */
  move(move: string, cubeAt: number, recovered: boolean): void;
  /** The cube's full state (after hello, and after each turn). */
  state(facelets: Facelets): void;
  battery(level: number): void;
  disconnect(): void;
}

// ---------------------------------------------------------------------------
// Encryption: AES-128 on single 16-byte blocks, with the browser's own crypto.
// (WebCrypto has no plain ECB, so one block of CBC with a zero IV is the same thing;
// decrypting uses an extra padding block, the trick cubing.js uses too.)

/** Bytes backed by a plain ArrayBuffer (what WebCrypto and Bluetooth take). */
type Bytes = Uint8Array<ArrayBuffer>;

const ZEROS: Bytes = new Uint8Array(16);
const PADDING: Bytes = new Uint8Array(16).fill(16);

let keyPromise: Promise<CryptoKey> | null = null;
const importAes = (key: Bytes) => crypto.subtle.importKey("raw", key, "AES-CBC", false, ["encrypt", "decrypt"]);
const qiyiKey = () => (keyPromise ??= importAes(KEY));

/** AES-128 of one 16-byte block (exported for the tests, which check it against the standard's example). */
export async function encryptBlock(block: Bytes, key?: Bytes, iv: Bytes = ZEROS): Promise<Bytes> {
  const out = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key ? await importAes(key) : await qiyiKey(), block);
  return new Uint8Array(out).slice(0, 16);
}

export async function decryptBlock(block: Bytes, key?: Bytes): Promise<Bytes> {
  const padding = await encryptBlock(PADDING, key, block);
  const both = new Uint8Array(32);
  both.set(block, 0);
  both.set(padding, 16);
  const out = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ZEROS }, key ? await importAes(key) : await qiyiKey(), both);
  return new Uint8Array(out).slice(0, 16);
}

export function crc16modbus(data: ArrayLike<number>): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
  }
  return crc;
}

/** [0xfe, length, ...content, crc] padded to 16 bytes, encrypted. */
export async function encodeMessage(content: number[]): Promise<Bytes> {
  const msg = [0xfe, 4 + content.length, ...content];
  const crc = crc16modbus(msg);
  msg.push(crc & 0xff, crc >> 8);
  while (msg.length % 16 !== 0) msg.push(0);
  const out = new Uint8Array(msg.length);
  for (let i = 0; i < msg.length; i += 16) out.set(await encryptBlock(new Uint8Array(msg.slice(i, i + 16))), i);
  return out;
}

/** Decrypted message without padding, or null when the checksum is wrong. */
export async function decodeMessage(data: Bytes): Promise<number[] | null> {
  const plain: number[] = [];
  for (let i = 0; i + 16 <= data.length; i += 16) plain.push(...(await decryptBlock(data.slice(i, i + 16))));
  const msg = plain.slice(0, plain[1]);
  if (msg.length < 3 || msg[0] !== 0xfe || crc16modbus(msg) !== 0) return null;
  return msg;
}

// ---------------------------------------------------------------------------
// Reading the cube's data

/** 27 bytes, two stickers each (low half first), colours in QiYi's order L R D U F B. */
export function parseFacelets(bytes: number[]): Facelets {
  let out = "";
  for (let i = 0; i < 54; i++) out += "LRDUFB"[(bytes[i >> 1] >> ((i % 2) << 2)) & 0xf] ?? "?";
  return out;
}

/** A real cube state: every colour 9 times, the centers where they belong. */
export function validFacelets(facelets: string): boolean {
  if (facelets.length !== 54) return false;
  for (const [i, face] of [4, 13, 22, 31, 40, 49].entries()) if (facelets[face] !== "URFDLB"[i]) return false;
  return [..."URFDLB"].every((c) => facelets.split(c).length - 1 === 9);
}

/** QiYi move codes: 1 L', 2 L, 3 R', 4 R, 5 D', 6 D, 7 U', 8 U, 9 F', 10 F, 11 B', 12 B. */
export function qiyiMove(code: number): string | null {
  if (code < 1 || code > 12) return null;
  const face = "LRDUFB"[(code - 1) >> 1];
  return code % 2 === 1 ? `${face}'` : face;
}

const timestampAt = (msg: number[], at: number) => ((msg[at] << 24) | (msg[at + 1] << 16) | (msg[at + 2] << 8) | msg[at + 3]) >>> 0;

/** The MAC from the cube's name: QY-QYSC-S-6BE1 -> CC:A3:00:00:6B:E1 (null if the name doesn't end in 4 hex digits). */
export function macFromName(name: string): string | null {
  const tail = /([0-9A-F]{2})([0-9A-F]{2})$/i.exec(name.trim());
  return tail ? `CC:A3:00:00:${tail[1]}:${tail[2]}`.toUpperCase() : null;
}

function helloContent(mac: string): number[] {
  const bytes = mac.split(":").map((b) => parseInt(b, 16));
  return [0x00, 0x6b, 0x01, 0x00, 0x00, 0x22, 0x06, 0x00, 0x02, 0x08, 0x00, ...bytes.reverse()];
}

// ---------------------------------------------------------------------------
// Connecting

/** Waits for the cube's advertisement to read its MAC (only some browsers allow it). */
async function macFromAdvertisement(device: BluetoothDevice, timeoutMs: number): Promise<string | null> {
  const watchable = device as BluetoothDevice & { watchAdvertisements?: (options?: { signal?: AbortSignal }) => Promise<void> };
  if (typeof watchable.watchAdvertisements !== "function") return null;
  const abort = new AbortController();
  return new Promise((resolve) => {
    const done = (mac: string | null) => {
      device.removeEventListener("advertisementreceived", onAdvertisement as EventListener);
      abort.abort();
      clearTimeout(timer);
      resolve(mac);
    };
    const onAdvertisement = (event: Event) => {
      const data = (event as Event & { manufacturerData?: BluetoothManufacturerData }).manufacturerData;
      const view = data?.get(QIYI_CIC);
      if (!view || view.byteLength < 6) return; // some packets carry no manufacturer data: keep listening
      const bytes = Array.from({ length: 6 }, (_, i) => view.getUint8(5 - i).toString(16).padStart(2, "0"));
      done(bytes.join(":").toUpperCase());
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    device.addEventListener("advertisementreceived", onAdvertisement as EventListener);
    watchable.watchAdvertisements({ signal: abort.signal }).catch(() => done(null));
  });
}

export interface QiyiConnection {
  name: string;
  mac: string;
  disconnect(): void;
}

/**
 * Picks a QiYi cube (the browser's list), connects, says hello and waits for the
 * cube's answer. `askMac` is asked only when the MAC can't be found by itself or
 * the cube doesn't answer to the one we guessed.
 */
export async function connectQiyi(events: QiyiEvents, askMac: (name: string, guess: string | null) => Promise<string | null>): Promise<QiyiConnection> {
  const filters = QIYI_NAME_PREFIXES.map((namePrefix) => ({ namePrefix }));
  let device: BluetoothDevice;
  try {
    device = await navigator.bluetooth.requestDevice({ filters, optionalServices: [SERVICE], optionalManufacturerData: [QIYI_CIC] } as RequestDeviceOptions);
  } catch (error) {
    // Older browsers don't know optionalManufacturerData: ask again without it.
    if (!(error instanceof TypeError)) throw error;
    device = await navigator.bluetooth.requestDevice({ filters, optionalServices: [SERVICE] });
  }
  const name = device.name?.trim() ?? "QiYi cube";
  const advertised = await macFromAdvertisement(device, 3000);

  const server = await device.gatt!.connect();
  const characteristic = await (await server.getPrimaryService(SERVICE)).getCharacteristic(CHARACTERISTIC);

  let greeted: () => void = () => {};
  const hello = new Promise<void>((resolve) => (greeted = resolve));
  let lastTimestamp = 0;
  let writing = Promise.resolve();
  const send = (content: number[]) => {
    // One write at a time: Bluetooth refuses overlapping writes.
    writing = writing.then(async () => characteristic.writeValue(await encodeMessage(content))).catch(() => {});
    return writing;
  };

  // Messages are decrypted one after another, in the order they came (decrypting is
  // asynchronous: two quick turns must never swap).
  let queue = Promise.resolve();
  const onValue = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const bytes: Bytes = new Uint8Array(value.byteLength);
    for (let i = 0; i < value.byteLength; i++) bytes[i] = value.getUint8(i);
    queue = queue.then(() => handle(bytes)).catch(() => {});
  };

  const handle = async (bytes: Bytes) => {
    const msg = await decodeMessage(bytes);
    if (!msg) return;
    const opcode = msg[2];
    const timestamp = timestampAt(msg, 3);
    if (opcode === 0x02) {
      void send(msg.slice(2, 7));
      const facelets = parseFacelets(msg.slice(7, 34));
      events.state(validFacelets(facelets) ? facelets : SOLVED_FACELETS);
      events.battery(msg[35]);
      lastTimestamp = timestamp;
      greeted();
    } else if (opcode === 0x03) {
      void send(msg.slice(2, 7));
      // The newest turn, then older ones Bluetooth may have lost (newest first in the message).
      const turns: [number, number][] = [[msg[34], timestamp]];
      while (turns.length < 10) {
        const at = 91 - 5 * turns.length;
        const older = timestampAt(msg, at);
        if (older <= lastTimestamp || at < 36) break;
        turns.push([msg[at + 4], older]);
      }
      for (let i = turns.length - 1; i >= 0; i--) {
        const move = qiyiMove(turns[i][0]);
        if (move) events.move(move, Math.trunc(turns[i][1] / TIMESTAMP_SCALE), i > 0);
      }
      const facelets = parseFacelets(msg.slice(7, 34));
      if (validFacelets(facelets)) events.state(facelets);
      events.battery(msg[35]);
      lastTimestamp = timestamp;
    }
  };

  const onDisconnected = () => events.disconnect();
  characteristic.addEventListener("characteristicvaluechanged", onValue);
  device.addEventListener("gattserverdisconnected", onDisconnected);
  await characteristic.startNotifications();

  const answered = (ms: number) => Promise.race([hello.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);
  const disconnect = () => {
    characteristic.removeEventListener("characteristicvaluechanged", onValue);
    device.removeEventListener("gattserverdisconnected", onDisconnected);
    server.disconnect();
  };

  // 1. The real MAC (advertisement) or the usual one (from the name).
  let mac = advertised ?? macFromName(name);
  if (mac) {
    await send(helloContent(mac));
    if (await answered(2500)) return { name, mac, disconnect };
  }
  // 2. Guessed from the name but no answer: some cubes use another 4th byte.
  if (!advertised && mac) {
    for (let fourth = 1; fourth < 8; fourth++) {
      const guess = mac.split(":");
      guess[3] = fourth.toString(16).padStart(2, "0").toUpperCase();
      await send(helloContent(guess.join(":")));
    }
    if (await answered(3000)) return { name, mac, disconnect };
  }
  // 3. Ask the player.
  const typed = await askMac(name, mac);
  if (typed) {
    mac = typed;
    await send(helloContent(mac));
    if (await answered(3000)) return { name, mac, disconnect };
  }
  disconnect();
  throw new Error(typed ? "The cube didn't answer. Check the MAC address, then try again." : "cancelled");
}
