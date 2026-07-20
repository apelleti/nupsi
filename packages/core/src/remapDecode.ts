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
import { KeyboardDescriptor, KeyboardMode } from "./descriptors.js";

/** One profile entry, in the same shape the .yml files use. */
export type RemapEntry =
    { key: string; modifiers?: string[] } | { raw: number };

/**
 * The inverse of buildKeymapsFromYaml for one mode: decodes a keymap read
 * from the keyboard into profile entries, relative to the default keymap.
 * Words that cannot be expressed as a known keycode (+ modifiers) come back
 * as `raw` entries so they round-trip unchanged.
 */
export function remapsFromKeymap(
    descriptor: KeyboardDescriptor,
    keymap: readonly number[],
    mode: KeyboardMode,
): Record<string, RemapEntry> {
    const defaults = descriptor.defaultKeymap[mode];
    const indices = descriptor.indicesByKeyName[mode];

    const nameByIndex = new Map<number, string>();
    for (const [name, index] of Object.entries(indices)) {
        if (!nameByIndex.has(index)) {
            nameByIndex.set(index, name);
        }
    }
    const nameByCode = new Map<number, string>();
    for (const [name, code] of Object.entries(descriptor.keycodesByKeyName)) {
        if (!nameByCode.has(code)) {
            nameByCode.set(code, name);
        }
    }
    const modifierEntries = Object.entries(descriptor.modifiersByModifierName);
    const allModifierBits = modifierEntries.reduce(
        (mask, [, bit]) => (mask | bit) >>> 0,
        0,
    );

    const remaps: Record<string, RemapEntry> = {};

    keymap.forEach((word, index) => {
        if (word === defaults[index]) {
            return;
        }
        const keyName = nameByIndex.get(index);
        if (keyName === undefined) {
            // Not a key the profiles can address; the write path never
            // touches it either (it copies the default), so skip it.
            return;
        }

        const exact = nameByCode.get(word);
        if (exact !== undefined) {
            remaps[keyName] = { key: exact };
            return;
        }

        const base = (word & ~allModifierBits) >>> 0;
        const baseName = nameByCode.get(base);
        if (baseName !== undefined) {
            const modifiers = modifierEntries
                .filter(([, bit]) => (word & bit) !== 0)
                .map(([name]) => name);
            remaps[keyName] = { key: baseName, modifiers };
            return;
        }

        remaps[keyName] = { raw: word };
    });

    return remaps;
}
