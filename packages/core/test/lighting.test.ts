import { describe, expect, it } from "vitest";
import {
    COLOR_OFFSET,
    EFFECT_OFFSET,
    LightingEffect,
    buildLightingReports,
    parseHexColor,
} from "../src/index";

describe("buildLightingReports", () => {
    it("reproduces the captured red / solid template exactly", () => {
        const { frame, config, handshakes } = buildLightingReports({
            r: 0xff,
            g: 0x00,
            b: 0x00,
            effect: LightingEffect.solid,
        });
        // Reports are the captured 1032-byte feature reports.
        expect(frame.length).toBe(1032);
        expect(config.length).toBe(1032);
        // Report ids / command bytes from the capture.
        expect([...frame.subarray(0, 4)]).toEqual([0x06, 0x08, 0xb8, 0x00]);
        expect([...config.subarray(0, 4)]).toEqual([0x06, 0x03, 0xb6, 0x00]);
        // Colour at 533, effect at config 144.
        expect([...frame.subarray(COLOR_OFFSET, COLOR_OFFSET + 3)]).toEqual([
            0xff, 0x00, 0x00,
        ]);
        expect(config[EFFECT_OFFSET]).toBe(0x01);
        // Handshakes.
        expect([...handshakes[0]!]).toEqual([0x05, 0x83, 0xb6, 0, 0, 0]);
        expect([...handshakes[1]!]).toEqual([0x05, 0x88, 0xb8, 0, 0, 0]);
    });

    it("patches only the colour bytes for a new colour", () => {
        const red = buildLightingReports({ r: 0xff, g: 0, b: 0 });
        const other = buildLightingReports({ r: 0x11, g: 0x22, b: 0x33 });
        const diffs = [...other.frame].reduce(
            (n, byte, i) => n + (byte !== red.frame[i] ? 1 : 0),
            0,
        );
        expect(diffs).toBe(3); // exactly the R,G,B triplet, all three differ
        expect([
            ...other.frame.subarray(COLOR_OFFSET, COLOR_OFFSET + 3),
        ]).toEqual([0x11, 0x22, 0x33]);
    });

    it("patches only the effect byte for a new effect", () => {
        const solid = buildLightingReports({ r: 1, g: 2, b: 3 });
        const reaction = buildLightingReports({
            r: 1,
            g: 2,
            b: 3,
            effect: LightingEffect.reaction,
        });
        const diffs = [...reaction.config].reduce(
            (n, byte, i) => n + (byte !== solid.config[i] ? 1 : 0),
            0,
        );
        expect(diffs).toBe(1);
        expect(reaction.config[EFFECT_OFFSET]).toBe(0x0c);
    });

    it("rejects out-of-range components", () => {
        expect(() => buildLightingReports({ r: 256, g: 0, b: 0 })).toThrow(
            RangeError,
        );
        expect(() => buildLightingReports({ r: -1, g: 0, b: 0 })).toThrow(
            RangeError,
        );
    });
});

describe("parseHexColor", () => {
    it("parses #rrggbb and rrggbb", () => {
        expect(parseHexColor("#ff8800")).toEqual({ r: 0xff, g: 0x88, b: 0x00 });
        expect(parseHexColor("00ff00")).toEqual({ r: 0, g: 0xff, b: 0 });
    });
    it("rejects malformed input", () => {
        expect(() => parseHexColor("xyz")).toThrow(RangeError);
        expect(() => parseHexColor("#fff")).toThrow(RangeError);
    });
});
