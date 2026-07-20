/*
    Nudelta Console
    Copyright (C) 2022-2026 Mohamed Gaber

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
// RGB lighting, reverse-engineered from the official NuPhy Console.
// See util/nuphy-console-notes.md. The wire format is a sequence of control
// feature reports; a colour lives at frame byte 533 (R,G,B) and the effect id
// at config byte 144.
import {
    LIGHTING_CONFIG_TEMPLATE_HEX,
    LIGHTING_FRAME_TEMPLATE_HEX,
} from "./data/lighting.js";

/** The two request-channel handshakes that precede a lighting write. */
export const LIGHTING_HANDSHAKE_0 = Uint8Array.from([
    0x05, 0x83, 0xb6, 0x00, 0x00, 0x00,
]);
export const LIGHTING_HANDSHAKE_1 = Uint8Array.from([
    0x05, 0x88, 0xb8, 0x00, 0x00, 0x00,
]);

/** Byte offset of the R,G,B colour triplet within the frame report. */
export const COLOR_OFFSET = 533;
/** Byte offset of the effect id within the config report. */
export const EFFECT_OFFSET = 144;

/** Effect ids, from the official app's Cfg.ini `LedOptN` catalog. Only the
 *  two confirmed by capture are named with confidence; others are provisional
 *  and can be passed as raw numbers. */
export const LightingEffect = {
    solid: 0x01,
    reaction: 0x0c,
    off: 0x00,
} as const;

export interface LightingEffectInfo {
    id: number;
    name: string;
    /** Whether the effect uses the chosen colour. Rainbow/multi-colour effects
     *  ignore it. From the official app's Cfg.ini `LedOptN` "color" flag. */
    color: boolean;
}

/**
 * The hardware effect catalog. `id` is the value written to config[144] (the
 * effect id). Names come from the official NuPhy Console's own strings
 * (`tc_kb_led<id>` in its text.xml), translated from Japanese. Static (1) and
 * Reaction (12) are confirmed by USB capture; the others follow the same
 * id↔name mapping. `color` is the app's per-effect colour-usable flag; `off`
 * (id 0) is a best guess for the value.
 */
export const LIGHTING_EFFECTS: readonly LightingEffectInfo[] = [
    { id: 1, name: "Static", color: true },
    { id: 2, name: "Breathing", color: true },
    { id: 3, name: "Rainbow Wheel", color: false },
    { id: 4, name: "Flash Away", color: true },
    { id: 5, name: "Raindrops", color: true },
    { id: 6, name: "Rainbow Roulette", color: true },
    { id: 7, name: "Ripple Shining", color: true },
    { id: 8, name: "Twinkling Stars", color: true },
    { id: 9, name: "Shadow Disappear", color: true },
    { id: 10, name: "Retro Snake", color: true },
    { id: 11, name: "Neon Stream", color: true },
    { id: 12, name: "Reaction", color: true },
    { id: 13, name: "Sine Wave", color: true },
    { id: 14, name: "Scan", color: true },
    { id: 15, name: "Rotary Windmill", color: false },
    { id: 16, name: "Colorful Fall", color: false },
    { id: 17, name: "Blossom", color: false },
    { id: 18, name: "Rotating Storm", color: true },
    { id: 19, name: "Collision", color: true },
    { id: 20, name: "Perfect", color: true },
    { id: 0, name: "Off", color: false },
];

export interface LightingOptions {
    r: number;
    g: number;
    b: number;
    /** Effect id (see LightingEffect); defaults to solid. */
    effect?: number;
}

function clampByte(n: number, name: string): number {
    if (!Number.isInteger(n) || n < 0 || n > 255) {
        throw new RangeError(`${name} must be an integer 0-255, got ${n}`);
    }
    return n;
}

export interface LightingReports {
    handshakes: readonly Uint8Array[];
    frame: Uint8Array;
    config: Uint8Array;
}

function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) {
        out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
}

/**
 * Builds the feature reports that set a solid colour + effect, by patching the
 * captured templates. Returns the exact byte sequence the keyboard expects.
 */
export function buildLightingReports(
    options: LightingOptions,
): LightingReports {
    const r = clampByte(options.r, "r");
    const g = clampByte(options.g, "g");
    const b = clampByte(options.b, "b");
    const effect = clampByte(options.effect ?? LightingEffect.solid, "effect");

    const frame = hexToBytes(LIGHTING_FRAME_TEMPLATE_HEX);
    const config = hexToBytes(LIGHTING_CONFIG_TEMPLATE_HEX);

    frame[COLOR_OFFSET] = r;
    frame[COLOR_OFFSET + 1] = g;
    frame[COLOR_OFFSET + 2] = b;
    config[EFFECT_OFFSET] = effect;

    return {
        handshakes: [LIGHTING_HANDSHAKE_0, LIGHTING_HANDSHAKE_1],
        frame,
        config,
    };
}

/** Parses a "#rrggbb" / "rrggbb" hex colour into components. */
export function parseHexColor(hex: string): {
    r: number;
    g: number;
    b: number;
} {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (m === null) {
        throw new RangeError(`Invalid hex colour: '${hex}' (expected rrggbb)`);
    }
    const n = parseInt(m[1]!, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
