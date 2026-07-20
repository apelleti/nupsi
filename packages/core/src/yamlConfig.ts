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
import YAML from "yaml";
import { KeyboardDescriptor, KeyboardMode } from "./descriptors.js";
import { ConfigError } from "./errors.js";

const TOP_LEVEL: Record<KeyboardMode, string> = {
    win: "keys",
    mac: "mackeys",
};

interface KeyRemap {
    key?: string;
    modifiers?: string[];
    raw?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUint32(value: unknown, context: string): number {
    if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 0xffffffff
    ) {
        throw new ConfigError(
            `Invalid config in ${context}: raw value must be an integer between 0 and 0xFFFFFFFF.`,
        );
    }
    return value >>> 0;
}

function normalizeEntry(
    topLevelKey: string,
    keyID: string,
    value: unknown,
): KeyRemap {
    if (typeof value === "string") {
        return { key: value };
    }
    if (!isPlainObject(value)) {
        throw new ConfigError(
            `Invalid config in ${topLevelKey}.${keyID}: expected a key name or a map.`,
        );
    }
    const remap: KeyRemap = {};
    if (value.raw !== undefined && value.raw !== null) {
        remap.raw = parseUint32(value.raw, `${topLevelKey}.${keyID}`);
        return remap;
    }
    if (typeof value.key === "string") {
        remap.key = value.key;
    }
    if (value.modifiers !== undefined && value.modifiers !== null) {
        if (!Array.isArray(value.modifiers)) {
            throw new ConfigError(
                `Invalid config in ${topLevelKey}.${keyID}: modifiers is not an array.`,
            );
        }
        remap.modifiers = value.modifiers.map(String);
    }
    return remap;
}

function getModeSection(
    config: unknown,
    mode: KeyboardMode,
): Record<string, unknown> | null {
    const topLevelKey = TOP_LEVEL[mode];
    if (!isPlainObject(config)) {
        return null;
    }
    const section = config[topLevelKey];
    if (section === undefined || section === null) {
        return null;
    }
    if (!isPlainObject(section)) {
        throw new ConfigError(
            `Invalid config file: '${topLevelKey}' is not a map.`,
        );
    }
    return section;
}

export interface ValidateOptions {
    /** Allow `raw:` entries (default true). Needed to round-trip on-device
     *  words the app can't name. */
    rawOk?: boolean;
}

/**
 * Validates one mode's section of a .yml profile against a keyboard.
 * Mirrors NuPhy::validateYAMLKeymap in the C++ implementation, including
 * its error messages.
 */
export function validateYamlKeymap(
    descriptor: KeyboardDescriptor,
    yamlString: string,
    mode: KeyboardMode,
    { rawOk = true }: ValidateOptions = {},
): void {
    const topLevelKey = TOP_LEVEL[mode];
    const keys = getModeSection(YAML.parse(yamlString), mode);
    if (keys === null) {
        return;
    }

    const indices = descriptor.indicesByKeyName[mode];
    const keycodes = descriptor.keycodesByKeyName;
    const modifiersByName = descriptor.modifiersByModifierName;

    for (const [keyID, rawValue] of Object.entries(keys)) {
        if (indices[keyID] === undefined) {
            throw new ConfigError(
                `Invalid config in ${topLevelKey}: a key for '${keyID}' does not exist in '${
                    mode === "mac" ? "Mac" : "Windows"
                }' mode.`,
            );
        }

        const remap = normalizeEntry(topLevelKey, keyID, rawValue);

        if (remap.raw !== undefined) {
            if (!rawOk) {
                throw new ConfigError(
                    `Invalid config in ${topLevelKey}.${keyID}: raw configurations are not supported by the Nupsi GUI.`,
                );
            }
            continue;
        }

        if (remap.key === undefined) {
            throw new ConfigError(
                `Invalid config in ${topLevelKey}.${keyID}: missing 'key' field.`,
            );
        }
        if (keycodes[remap.key] === undefined) {
            throw new ConfigError(
                `Invalid config in ${topLevelKey}.${keyID}: a code for key '${remap.key}' was not found.`,
            );
        }

        for (const modifierName of remap.modifiers ?? []) {
            if (modifiersByName[modifierName] === undefined) {
                throw new ConfigError(
                    `Invalid config in ${topLevelKey}.${keyID}: Unknown modifier ${modifierName}: make sure you're not adding a direction, e.g. lalt instead of alt`,
                );
            }
        }
    }
}

/**
 * Validates a full profile and produces the keymaps to write, one per mode,
 * starting from the keyboard's default keymap.
 */
export function buildKeymapsFromYaml(
    descriptor: KeyboardDescriptor,
    yamlString: string,
    options: ValidateOptions = {},
): { win: number[]; mac: number[] } {
    validateYamlKeymap(descriptor, yamlString, "win", options);
    validateYamlKeymap(descriptor, yamlString, "mac", options);

    const config = YAML.parse(yamlString);
    const result = { win: [] as number[], mac: [] as number[] };

    for (const mode of ["win", "mac"] as const) {
        const topLevelKey = TOP_LEVEL[mode];
        const keymap = [...descriptor.defaultKeymap[mode]];
        const indices = descriptor.indicesByKeyName[mode];
        const section = getModeSection(config, mode) ?? {};

        for (const [keyID, rawValue] of Object.entries(section)) {
            const index = indices[keyID]!;
            // Guard the descriptor's own invariant (as finalizeKeymap does for
            // aliases): an out-of-range index would grow the array with holes
            // that serialize as extra zero words and corrupt the report.
            if (index >= keymap.length) {
                throw new ConfigError(
                    `Invalid keyboard data: index ${index} for '${keyID}' is out of range (keymap length ${keymap.length}).`,
                );
            }
            const remap = normalizeEntry(topLevelKey, keyID, rawValue);

            if (remap.raw !== undefined) {
                keymap[index] = remap.raw;
                continue;
            }

            let code = descriptor.keycodesByKeyName[remap.key!]!;
            for (const modifierName of remap.modifiers ?? []) {
                code =
                    (code |
                        descriptor.modifiersByModifierName[modifierName]!) >>>
                    0;
            }
            keymap[index] = code;
        }

        result[mode] = keymap;
    }

    return result;
}
