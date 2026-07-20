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
import * as air60 from "./data/air60.js";
import * as air75 from "./data/air75.js";
import * as halo75 from "./data/halo75.js";
import { keycodesByKeyName, modifiersByModifierName } from "./data/keycodes.js";

export type KeyboardMode = "win" | "mac";

export interface PerMode<T> {
    readonly win: T;
    readonly mac: T;
}

/**
 * Copies applied to the keymap right before writing it to the keyboard;
 * some boards mirror one index onto another (`keymap[to] = keymap[from]`).
 */
export interface KeymapAlias {
    readonly to: number;
    readonly from: number;
}

export interface KeyboardDescriptor {
    readonly name: string;
    /** Exact HID product string reported by the keyboard. */
    readonly productString: string;
    /** Feature report sent on the request channel to ask for the keymap. */
    readonly getKeymapHeader: PerMode<readonly number[]>;
    /** Prefix of the feature report that writes the keymap. */
    readonly setKeymapHeader: PerMode<readonly number[]>;
    readonly defaultKeymap: PerMode<readonly number[]>;
    readonly indicesByKeyName: PerMode<Readonly<Record<string, number>>>;
    readonly keycodesByKeyName: Readonly<Record<string, number>>;
    readonly modifiersByModifierName: Readonly<Record<string, number>>;
    readonly keymapAliases: readonly KeymapAlias[];
}

export const VENDOR_ID = 0x05ac;
export const PRODUCT_ID = 0x024f;
export const USAGE = 1;
export const USAGE_PAGE = 0xff00;

export const AIR75: KeyboardDescriptor = {
    name: "Air75",
    productString: "Air75",
    getKeymapHeader: {
        win: [0x05, 0x84, 0xd8, 0x00, 0x00, 0x00],
        mac: [0x05, 0x84, 0xd4, 0x00, 0x00, 0x00],
    },
    setKeymapHeader: {
        win: [0x06, 0x04, 0xd8, 0x00, 0x40, 0x00, 0x00, 0x00],
        mac: [0x06, 0x04, 0xd4, 0x00, 0x40, 0x00, 0x00, 0x00],
    },
    defaultKeymap: { win: air75.defaultKeymapWin, mac: air75.defaultKeymapMac },
    indicesByKeyName: {
        win: air75.indicesByKeyNameWin,
        mac: air75.indicesByKeyNameMac,
    },
    keycodesByKeyName,
    modifiersByModifierName,
    keymapAliases: [],
};

export const AIR60: KeyboardDescriptor = {
    name: "Air60",
    productString: "Air60",
    getKeymapHeader: {
        win: [0x05, 0x84, 0xd8, 0x00, 0x00, 0x00],
        mac: [0x05, 0x84, 0xd4, 0x00, 0x00, 0x00],
    },
    setKeymapHeader: {
        win: [0x06, 0x04, 0xd8, 0x00, 0x40, 0x00, 0x00, 0x00],
        mac: [0x06, 0x04, 0xd4, 0x00, 0x40, 0x00, 0x00, 0x00],
    },
    defaultKeymap: { win: air60.defaultKeymapWin, mac: air60.defaultKeymapMac },
    indicesByKeyName: {
        win: air60.indicesByKeyNameWin,
        mac: air60.indicesByKeyNameMac,
    },
    keycodesByKeyName,
    modifiersByModifierName,
    // The Air60 firmware expects these entries duplicated (cf. lib/nuphy.cpp,
    // Air60::setKeymap in the C++ implementation).
    keymapAliases: [
        { to: 167, from: 0 },
        { to: 94, from: 90 },
    ],
};

// Note: the Halo75's mac/win report headers are swapped relative to the Air
// boards. This mirrors the C++ implementation and the captured USB traffic.
export const HALO75: KeyboardDescriptor = {
    name: "Halo75",
    productString: "NuPhy Halo75",
    getKeymapHeader: {
        win: [0x05, 0x84, 0xd4, 0x00, 0x00, 0x00],
        mac: [0x05, 0x84, 0xd8, 0x00, 0x00, 0x00],
    },
    setKeymapHeader: {
        win: [0x06, 0x04, 0xd4, 0x00, 0x40, 0x00, 0x00, 0x00],
        mac: [0x06, 0x04, 0xd8, 0x00, 0x40, 0x00, 0x00, 0x00],
    },
    defaultKeymap: {
        win: halo75.defaultKeymapWin,
        mac: halo75.defaultKeymapMac,
    },
    indicesByKeyName: {
        win: halo75.indicesByKeyNameWin,
        mac: halo75.indicesByKeyNameMac,
    },
    keycodesByKeyName,
    modifiersByModifierName,
    keymapAliases: [],
};

export const DESCRIPTORS: readonly KeyboardDescriptor[] = [
    AIR75,
    AIR60,
    HALO75,
];

/**
 * Maps a HID product string to a keyboard descriptor. With `verify` disabled,
 * any device is treated as an Air75, mirroring the C++ `--no-verify` behavior.
 */
export function matchDescriptor(
    productString: string,
    verify = true,
): KeyboardDescriptor | null {
    if (!verify) {
        return AIR75;
    }
    return DESCRIPTORS.find((d) => d.productString === productString) ?? null;
}
