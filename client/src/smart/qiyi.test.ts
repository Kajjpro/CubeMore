import { describe, expect, it } from "vitest";
import { SOLVED_FACELETS, applyMoves } from "@cube-racing/shared/cube3";
import { crc16modbus, decodeMessage, decryptBlock, encodeMessage, encryptBlock, macFromName, parseFacelets, qiyiMove, validFacelets } from "./qiyi";

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (text: string) => new Uint8Array(text.match(/../g)!.map((b) => parseInt(b, 16)));

/** Packs facelets the way a QiYi cube sends them: two stickers a byte, low half first, colours L R D U F B. */
function pack(facelets: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < 54; i += 2) bytes.push("LRDUFB".indexOf(facelets[i]) | ("LRDUFB".indexOf(facelets[i + 1]) << 4));
  return bytes;
}

describe("QiYi encryption", () => {
  it("AES-128 matches the standard's example (FIPS-197, appendix C.1)", async () => {
    const key = fromHex("000102030405060708090a0b0c0d0e0f");
    const plain = fromHex("00112233445566778899aabbccddeeff");
    const cipher = await encryptBlock(plain, key);
    expect(hex(cipher)).toBe("69c4e0d86a7b0430d8cdb78070b4c55a");
    expect(hex(await decryptBlock(cipher, key))).toBe(hex(plain));
  });

  it("a message has a CRC-16/MODBUS that checks out, and survives encrypt + decrypt", async () => {
    expect(crc16modbus([0x01, 0x03, 0x00, 0x00, 0x00, 0x01])).toBe(0x0a84); // the usual Modbus example
    const content = [0x03, 0x00, 0x00, 0x12, 0x34, ...pack(SOLVED_FACELETS), 8, 77];
    const encrypted = await encodeMessage(content);
    expect(encrypted.length % 16).toBe(0);
    const decoded = await decodeMessage(encrypted);
    expect(decoded).not.toBeNull();
    expect(decoded!.slice(2, decoded!.length - 2)).toEqual(content);
    // A corrupted message is refused.
    encrypted[3] ^= 0xff;
    expect(await decodeMessage(encrypted)).toBeNull();
  });
});

describe("QiYi data", () => {
  it("reads the cube's state", () => {
    expect(parseFacelets(pack(SOLVED_FACELETS))).toBe(SOLVED_FACELETS);
    const scrambled = applyMoves(SOLVED_FACELETS, ["R", "U", "F2", "D'", "L", "B"]);
    expect(parseFacelets(pack(scrambled))).toBe(scrambled);
    expect(validFacelets(scrambled)).toBe(true);
    expect(validFacelets(SOLVED_FACELETS.replace("U", "R"))).toBe(false);
  });

  it("reads the turns", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(qiyiMove)).toEqual(["L'", "L", "R'", "R", "D'", "D", "U'", "U", "F'", "F", "B'", "B"]);
    expect(qiyiMove(0)).toBeNull();
  });

  it("guesses the MAC address from the cube's name", () => {
    expect(macFromName("QY-QYSC-S-6BE1")).toBe("CC:A3:00:00:6B:E1");
    expect(macFromName("XMD-TornadoV4-i-A0F3")).toBe("CC:A3:00:00:A0:F3");
    expect(macFromName("QiYi")).toBeNull();
  });
});
