/*
    Nupsi, derived from Nudelta Console
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
// Copy one keymap (Windows or Mac) onto the other, so every physical key does
// the same thing whichever way the side switch is set.
//
// Keys are paired physically, by their (row, column) in the two layouts: a
// key's name — and on some boards its index in the keymap — differs between
// modes (the key left of Space is "lalt" on Windows but "lmeta" on Mac), so
// copying raw words index by index would scramble them.
//
// Keymap slots the layouts don't show (e.g. the Air60's Fn layer, or the
// Fn+arrow slots) are then paired by name, when both modes have that name.
//
// The copy itself is done on the encoded keymaps, word for word, rather than
// from the layouts' default mappings: those are display hints and don't
// always match the factory keymap, whereas the words are exactly what gets
// written. The result is then decoded back into profile entries with the same
// decoder used when reading the keyboard.
import {
    KeyboardDescriptor,
    KeyboardMode,
    RemapEntry,
    buildKeymapsFromYaml,
    remapsFromKeymap,
} from "@nupsi/core";
import YAML from "yaml";

/** The parts of a layout key (see keyboards.js) that the copy needs. */
export interface LayoutKey {
    id: string;
    altID: string | null;
    remappable: boolean;
}

export type Layout = readonly (readonly LayoutKey[])[];

export interface Config {
    keys?: Record<string, RemapEntry>;
    mackeys?: Record<string, RemapEntry>;
}

const SECTION = { win: "keys", mac: "mackeys" } as const;

/** [fromID, toID] for every physical key (and Fn layer) both modes can remap. */
function physicalPairs(from: Layout, to: Layout): [string, string][] {
    const pairs: [string, string][] = [];
    from.forEach((row, r) =>
        row.forEach((fromKey, c) => {
            const toKey = to[r]?.[c];
            if (!toKey || !fromKey.remappable || !toKey.remappable) {
                return;
            }
            pairs.push([fromKey.id, toKey.id]);
            if (fromKey.altID && toKey.altID) {
                pairs.push([fromKey.altID, toKey.altID]);
            }
        }),
    );
    return pairs;
}

/**
 * Returns a new config whose `to` keymap reproduces the `from` keymap on
 * every physical key both modes can address. The `from` keymap is unchanged.
 */
export function copyKeymap(
    descriptor: KeyboardDescriptor,
    layouts: Record<KeyboardMode, Layout>,
    config: Config,
    from: KeyboardMode,
    to: KeyboardMode,
): Config {
    const keymaps = buildKeymapsFromYaml(
        descriptor,
        YAML.stringify({
            keys: config.keys ?? {},
            mackeys: config.mackeys ?? {},
        }),
        { rawOk: true },
    );
    const target = [...keymaps[to]];
    const pairs = physicalPairs(layouts[from], layouts[to]);
    // Slots the layouts don't show: pair them by name. Names already used by
    // a physical pair are skipped on both sides, since the same name can sit
    // on different keys in the two modes (e.g. lalt).
    const usedFrom = new Set(pairs.map(([fromID]) => fromID));
    const usedTo = new Set(pairs.map(([, toID]) => toID));
    for (const name of Object.keys(descriptor.indicesByKeyName[from])) {
        if (
            !usedFrom.has(name) &&
            !usedTo.has(name) &&
            name in descriptor.indicesByKeyName[to]
        ) {
            pairs.push([name, name]);
        }
    }
    for (const [fromID, toID] of pairs) {
        const fromIndex = descriptor.indicesByKeyName[from][fromID];
        const toIndex = descriptor.indicesByKeyName[to][toID];
        if (fromIndex === undefined || toIndex === undefined) {
            continue;
        }
        target[toIndex] = keymaps[from][fromIndex]!;
    }
    return {
        ...config,
        [SECTION[to]]: remapsFromKeymap(descriptor, target, to),
    };
}
