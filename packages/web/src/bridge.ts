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
import {
    LightingOptions,
    NuPhyKeyboard,
    PRODUCT_ID,
    RemapEntry,
    USAGE,
    USAGE_PAGE,
    VENDOR_ID,
    remapsFromKeymap,
    validateYamlKeymap,
} from "@nupsi/core";
import YAML from "yaml";
import {
    isVendorCollection,
    keyboardFromHidDevice,
} from "./webHidTransport.js";

export interface KeyboardInfo {
    info: string;
    kind: string;
}

let keyboard: NuPhyKeyboard | null = null;

/** WebHID is Chromium-only as of 2026. */
export function isSupported(): boolean {
    return "hid" in navigator;
}

function adopt(devices: HIDDevice[]): KeyboardInfo | null {
    const device = devices.find(isVendorCollection) ?? null;
    if (device === null) {
        keyboard = null;
        return null;
    }
    keyboard = keyboardFromHidDevice(device);
    return {
        info: `NuPhy ${keyboard.name}`,
        kind: keyboard.name,
    };
}

/** Prompts the user to pick their keyboard. Must be called on a user gesture. */
export async function connect(): Promise<KeyboardInfo | null> {
    const devices = await navigator.hid.requestDevice({
        filters: [
            {
                vendorId: VENDOR_ID,
                productId: PRODUCT_ID,
                usagePage: USAGE_PAGE,
                usage: USAGE,
            },
        ],
    });
    return adopt(devices);
}

/** Re-adopts a keyboard the user has already granted access to, if any. */
export async function getKeyboardInfo(): Promise<KeyboardInfo | null> {
    const devices = await navigator.hid.getDevices();
    return adopt(
        devices.filter(
            (d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID,
        ),
    );
}

function requireKeyboard(): NuPhyKeyboard {
    if (keyboard === null) {
        throw new Error("The keyboard was unplugged.");
    }
    return keyboard;
}

/** Validates a profile file against the connected keyboard.
 *  rawOk: the web UI now renders and preserves raw entries, and a backup of
 *  the device can legitimately contain them, so loading a file must accept
 *  raw — matching writeConfig. */
export function validateConfig(yamlText: string): void {
    const kb = requireKeyboard();
    validateYamlKeymap(kb.descriptor, yamlText, "win", { rawOk: true });
    validateYamlKeymap(kb.descriptor, yamlText, "mac", { rawOk: true });
}

/** Serializes the GUI config and writes it to the keyboard.
 *  rawOk: raw entries can legitimately appear when the config was seeded
 *  from the keyboard's own state (words we cannot name). */
export async function writeConfig(config: unknown): Promise<void> {
    const kb = requireKeyboard();
    await kb.setKeymapFromYaml(YAML.stringify(config), { rawOk: true });
}

/** Sets a solid RGB backlight colour and effect. Experimental. */
export async function setLighting(options: LightingOptions): Promise<void> {
    await requireKeyboard().setLighting(options);
}

export interface CurrentRemaps {
    keys: Record<string, RemapEntry>;
    mackeys: Record<string, RemapEntry>;
}

/** Reads the keymaps off the keyboard and decodes them into profile
 *  entries, so the UI can start from the keyboard's actual state. */
export async function readCurrentRemaps(): Promise<CurrentRemaps | null> {
    if (keyboard === null) {
        return null;
    }
    const kb = keyboard;
    return {
        keys: remapsFromKeymap(kb.descriptor, await kb.getKeymap("win"), "win"),
        mackeys: remapsFromKeymap(
            kb.descriptor,
            await kb.getKeymap("mac"),
            "mac",
        ),
    };
}
