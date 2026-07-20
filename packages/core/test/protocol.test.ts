import { describe, expect, it } from "vitest";
import {
    AIR60,
    AIR75,
    HALO75,
    DATA_REPORT_ID,
    ProtocolError,
    buildGetKeymapRequest,
    buildSetKeymapReport,
    finalizeKeymap,
    parseKeymapReport,
    serializeKeymapWords,
} from "../src/index";

describe("report construction", () => {
    it("get-keymap requests match the C++ headers", () => {
        expect([...buildGetKeymapRequest(AIR75, "win")]).toEqual([
            0x05, 0x84, 0xd8, 0x00, 0x00, 0x00,
        ]);
        expect([...buildGetKeymapRequest(AIR75, "mac")]).toEqual([
            0x05, 0x84, 0xd4, 0x00, 0x00, 0x00,
        ]);
        // Halo75 has win/mac swapped relative to the Air boards.
        expect([...buildGetKeymapRequest(HALO75, "win")]).toEqual([
            0x05, 0x84, 0xd4, 0x00, 0x00, 0x00,
        ]);
        expect([...buildGetKeymapRequest(HALO75, "mac")]).toEqual([
            0x05, 0x84, 0xd8, 0x00, 0x00, 0x00,
        ]);
    });

    it("set-keymap report = header + little-endian payload", () => {
        const report = buildSetKeymapReport(
            AIR75,
            "win",
            AIR75.defaultKeymap.win,
        );
        expect([...report.subarray(0, 8)]).toEqual([
            0x06, 0x04, 0xd8, 0x00, 0x40, 0x00, 0x00, 0x00,
        ]);
        expect(report.subarray(8)).toEqual(
            serializeKeymapWords(AIR75.defaultKeymap.win),
        );
        expect(report[0]).toBe(DATA_REPORT_ID);
    });

    it("applies the Air60 keymap aliases before writing", () => {
        const keymap = [...AIR60.defaultKeymap.win];
        keymap[0] = 0x12345678;
        keymap[90] = 0x0a0b0c0d;

        const finalized = finalizeKeymap(AIR60, keymap);
        expect(finalized[167]).toBe(0x12345678);
        expect(finalized[94]).toBe(0x0a0b0c0d);
        // The input is not mutated.
        expect(keymap[167]).toBe(AIR60.defaultKeymap.win[167]);

        const report = buildSetKeymapReport(AIR60, "win", keymap);
        const view = new DataView(report.buffer);
        expect(view.getUint32(8 + 167 * 4, true)).toBe(0x12345678);
        expect(view.getUint32(8 + 94 * 4, true)).toBe(0x0a0b0c0d);
    });

    it("rejects keymaps too short for the board's aliases", () => {
        expect(() => finalizeKeymap(AIR60, [1, 2, 3])).toThrow(ProtocolError);
    });
});

describe("response parsing", () => {
    it("skips the 8-byte response header", () => {
        const words = [0x29000000, 0xe1000006];
        const payload = serializeKeymapWords(words);
        const report = new Uint8Array(8 + payload.length);
        report[0] = DATA_REPORT_ID;
        report.set(payload, 8);
        expect(parseKeymapReport(report)).toEqual(words);
    });

    it("rejects a response shorter than its header", () => {
        expect(() => parseKeymapReport(new Uint8Array(5))).toThrow(
            ProtocolError,
        );
    });

    it("ignores trailing bytes that do not form a whole word", () => {
        const report = new Uint8Array(8 + 6);
        expect(parseKeymapReport(report)).toEqual([0]);
    });
});
