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
// One-click keymap presets.
//
// A preset group is a set of mutually exclusive options; the first one is
// always "the keyboard's default" (no remap). Applying an option clears every
// key the group touches, then writes that option's remaps — so switching
// options never leaves a half-applied previous choice behind.
//
// Options carry remaps for BOTH keymaps ("keys" = Windows, "mackeys" = Mac),
// because the point of most of these is to behave the same on both sides of
// the physical switch. Note that a few physical keys have different IDs per
// keymap: the key next to the spacebar is `lalt` on Windows and `lmeta` on
// Mac, and the one to its right is `ralt` / `rmeta`.

export const SECTIONS = ["keys", "mackeys"];

/** Same remaps on both keymaps. */
function both(remaps) {
    return { keys: remaps, mackeys: structuredClone(remaps) };
}

/** A clipboard shortcut: ⌘X on Mac, Ctrl+X on Windows. */
function clipboard(letter) {
    return {
        win: { key: letter, modifiers: ["ctrl"] },
        mac: { key: letter, modifiers: ["meta"] },
    };
}

// What a single key can be turned into, with the equivalent shortcut on each
// OS, so the key does the same thing whichever way the side switch is set.
const KEY_ACTIONS = [
    {
        id: "cut",
        label: "Cut",
        hint: "Ctrl+X on Windows, ⌘X on Mac.",
        ...clipboard("x"),
    },
    {
        id: "copy",
        label: "Copy",
        hint: "Ctrl+C on Windows, ⌘C on Mac.",
        ...clipboard("c"),
    },
    {
        id: "paste",
        label: "Paste",
        hint: "Ctrl+V on Windows, ⌘V on Mac.",
        ...clipboard("v"),
    },
    {
        id: "lock",
        label: "Lock screen",
        hint: "Win+L on Windows and Linux, ⌃⌘Q on Mac.",
        win: { key: "l", modifiers: ["meta"] },
        mac: { key: "q", modifiers: ["ctrl", "meta"] },
    },
    {
        id: "emoji",
        label: "Emoji picker",
        hint: "Win+. on Windows, ⌃⌘Space on Mac.",
        win: { key: "period", modifiers: ["meta"] },
        mac: { key: "space", modifiers: ["ctrl", "meta"] },
    },
    {
        id: "search",
        label: "Search",
        hint: "A tap on Super — Start menu on Windows, Activities on GNOME — and Spotlight (⌘Space) on Mac.",
        win: { key: "lmeta" },
        mac: { key: "space", modifiers: ["meta"] },
    },
];

/** The option list for a group that repurposes one key. */
function keyActionOptions(id, defaultOption) {
    return [
        { ...defaultOption, id: "default", remaps: { keys: {}, mackeys: {} } },
        ...KEY_ACTIONS.map((action) => ({
            id: action.id,
            label: action.label,
            hint: action.hint,
            remaps: {
                keys: { [id]: action.win },
                mackeys: { [id]: action.mac },
            },
        })),
    ];
}

// Windows keymap only. On Mac both layers ship as plain F1–F12: it is macOS
// itself that turns them into brightness/media, from System Settings.
const FN_ROW_SWAP = {
    f1: "brightnessdown",
    f2: "brightnessup",
    f5: "backlightdown",
    f6: "backlightup",
    f7: "rewind",
    f8: "playpause",
    f9: "forward",
    f10: "mute",
    f11: "volumedown",
    f12: "volumeup",
};

/** F-row and Fn layer trading places, in the Windows keymap. */
function fnRowSwapped() {
    let keys = {};
    for (let [fKey, action] of Object.entries(FN_ROW_SWAP)) {
        keys[fKey] = { key: action };
        keys[action] = { key: fKey };
    }
    return { keys, mackeys: {} };
}

export const PRESET_GROUPS = [
    {
        id: "shortcut-modifier",
        label: "Shortcut key",
        hint: "Which physical key does copy/paste — the same one on Windows and on Mac. The two modifiers swap, so nothing is lost.",
        options: [
            {
                id: "default",
                label: "Keyboard default",
                hint: "Ctrl on Windows, ⌘ on Mac — different fingers on each side.",
                remaps: { keys: {}, mackeys: {} },
            },
            {
                id: "cmd-position",
                label: "Next to space (⌘ position)",
                hint: "Windows: the key next to the spacebar becomes Ctrl, and Alt moves to the bottom-left corner. Mac keeps ⌘ where it is.",
                remaps: {
                    keys: { lalt: { key: "lctrl" }, lctrl: { key: "lalt" } },
                    mackeys: {},
                },
            },
            {
                id: "ctrl-position",
                label: "Bottom-left (Ctrl position)",
                hint: "Mac: the bottom-left key becomes ⌘, and Control moves next to the spacebar. Windows keeps Ctrl where it is.",
                remaps: {
                    keys: {},
                    mackeys: {
                        lctrl: { key: "lmeta" },
                        lmeta: { key: "lctrl" },
                    },
                },
            },
        ],
    },
    {
        id: "letters",
        label: "Letter keys",
        hint: "Swaps the letters in hardware. Use it only if your computer is set to a US QWERTY layout — if the OS is already French AZERTY, leave this on QWERTY.",
        options: [
            {
                id: "qwerty",
                label: "QWERTY",
                hint: "The keycaps as printed.",
                remaps: { keys: {}, mackeys: {} },
            },
            {
                id: "azerty",
                label: "AZERTY",
                hint: "A↔Q, Z↔W and M↔; — three plain swaps. A real AZERTY puts a comma where M was; swapping instead keeps the semicolon reachable and loses no character.",
                remaps: both({
                    q: { key: "a" },
                    a: { key: "q" },
                    w: { key: "z" },
                    z: { key: "w" },
                    semicolon: { key: "m" },
                    m: { key: "semicolon" },
                }),
            },
        ],
    },
    {
        id: "capslock",
        label: "Caps Lock",
        hint: "The biggest easy-to-reach key on the board, rarely used for what it does.",
        options: [
            {
                id: "default",
                label: "Caps Lock",
                hint: "Left as-is.",
                remaps: { keys: {}, mackeys: {} },
            },
            {
                id: "esc",
                label: "Escape",
                hint: "A second, closer Escape — the classic Vim/terminal setup.",
                remaps: both({ capslock: { key: "esc" } }),
            },
            {
                id: "ctrl",
                label: "Control",
                hint: "A second Control under the little finger.",
                remaps: both({ capslock: { key: "lctrl" } }),
            },
        ],
    },
    {
        id: "f-row",
        label: "F-row",
        hint: "Windows keymap only — in Mac mode the keyboard sends plain F1–F12 and it is macOS that turns them into brightness and media, from System Settings › Keyboard.",
        options: [
            {
                id: "f-keys-first",
                label: "F1–F12 first",
                hint: "Media and brightness live on the Fn layer. F3 and F4 have nothing on Fn under Windows either way.",
                remaps: { keys: {}, mackeys: {} },
            },
            {
                id: "media-first",
                label: "Media first",
                hint: "Volume, playback, brightness and backlight without holding Fn — and Fn+F1…F12 for the real function keys.",
                remaps: fnRowSwapped(),
            },
        ],
    },
    {
        id: "scissors-key",
        label: "✂️ key",
        hint: "Top row, left of 🐱.",
        options: keyActionOptions("screenshot", {
            label: "Screenshot",
            hint: "Win+Shift+S on Windows, ⌘⇧4 on Mac — what the keycap says.",
        }),
    },
    {
        id: "assistant-key",
        label: "🐱 key",
        hint: "Ships as Copilot (Win+C) on Windows and Fn+Space on Mac — dead weight on Linux.",
        options: keyActionOptions("assistant", {
            label: "Assistant",
            hint: "Left as-is.",
        }),
    },
    {
        id: "right-ctrl-key",
        label: "Right Ctrl",
        hint: "Rarely used — the left one does the same job.",
        options: keyActionOptions("rctrl", {
            label: "Right Control",
            hint: "Left as-is.",
        }),
    },
];

/** Comparable form of a remap entry, matching the app's own normalization. */
function entryKey(entry) {
    if (entry === undefined || entry === null) {
        return null;
    }
    if (typeof entry === "string") {
        entry = { key: entry };
    }
    if (entry.raw !== undefined && entry.raw !== null) {
        return `raw:${entry.raw}`;
    }
    let modifiers = [...(entry.modifiers ?? [])].sort().join("+");
    return `${entry.key ?? ""}|${modifiers}`;
}

/** Every key ID a group can touch, per keymap section. */
export function groupTouchedIDs(group) {
    let touched = {};
    for (let section of SECTIONS) {
        touched[section] = new Set();
        for (let option of group.options) {
            for (let id in option.remaps[section] ?? {}) {
                touched[section].add(id);
            }
        }
    }
    return touched;
}

/**
 * Keep the options this keyboard can actually run, and drop a group entirely
 * when none are left. An option is all-or-nothing: applying half of "cut, copy
 * and paste" would leave a preset whose label lies about what it did.
 * `availableIDs` is `{keys: Set, mackeys: Set}`.
 */
export function usableGroups(groups, availableIDs) {
    let supported = (option) =>
        SECTIONS.every((section) =>
            Object.keys(option.remaps[section] ?? {}).every((id) =>
                availableIDs[section].has(id),
            ),
        );
    let usable = [];
    for (let group of groups) {
        // The first option is the "leave it alone" one: it remaps nothing, so
        // it is always supported, and alone it isn't worth showing.
        let options = group.options.filter(supported);
        if (options.length > 1) {
            usable.push({ ...group, options });
        }
    }
    return usable;
}

/**
 * Which option of `group` the config currently matches, or null when the keys
 * it touches have been edited by hand into something else.
 */
export function activeOptionID(group, config) {
    let touched = groupTouchedIDs(group);
    for (let option of group.options) {
        let matches = SECTIONS.every((section) =>
            [...touched[section]].every(
                (id) =>
                    entryKey((config[section] ?? {})[id]) ===
                    entryKey((option.remaps[section] ?? {})[id]),
            ),
        );
        if (matches) {
            return option.id;
        }
    }
    return null;
}

/**
 * Apply an option to a `{keys, mackeys}` config, returning a new config. Every
 * key the group owns is cleared first, so any previous option — or a manual
 * remap on those keys — is replaced rather than merged with.
 */
export function applyOption(config, group, optionID) {
    let option = group.options.find((candidate) => candidate.id === optionID);
    if (!option) {
        return config;
    }
    let touched = groupTouchedIDs(group);
    let next = {};
    for (let section of SECTIONS) {
        next[section] = { ...(config[section] ?? {}) };
        for (let id of touched[section]) {
            delete next[section][id];
        }
        for (let [id, entry] of Object.entries(option.remaps[section] ?? {})) {
            next[section][id] = structuredClone(entry);
        }
    }
    return next;
}
