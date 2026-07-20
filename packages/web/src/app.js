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
// Ported from ui/src/app.js (the Electron renderer): the window.ipc bridge to
// the main process is replaced by ./bridge.js, which talks WebHID directly.
"use strict";
import "@fontsource/nunito/500.css";
import "./app.css";
import "./toggle.css";

import YAML from "yaml";
import * as bridge from "./bridge.js";
import keyboards from "./keyboards.js";
import modifiers from "./modifiers.js";
import { g, n } from "./tinydom.js";

class Config {
    constructor() {
        this.winRemap = {};
        this.macRemap = {};
    }
    getRemap(mode) {
        if (mode === "mac") {
            return Object.assign({}, this.macRemap);
        } else {
            return Object.assign({}, this.winRemap);
        }
    }

    setRemap(mode, incoming) {
        if (mode === "mac") {
            this.macRemap = incoming;
        } else {
            this.winRemap = incoming;
        }
        redrawKeyboard();
        redrawOptions();
    }

    unmarshall(config) {
        let keys = config.keys ?? {};
        for (let key in keys) {
            let remap = keys[key];
            if (typeof remap == "string") {
                keys[key] = { key: remap };
            }
        }

        let mackeys = config.mackeys ?? {};
        for (let key in mackeys) {
            let remap = mackeys[key];
            if (typeof remap == "string") {
                mackeys[key] = { key: remap };
            }
        }
        this.winRemap = keys;
        this.setRemap("mac", mackeys);
    }

    marshall() {
        return {
            keys: this.winRemap,
            mackeys: this.macRemap,
        };
    }
}

window.unsafe = false;
function safetyOff(silent = false) {
    if (!silent) {
        toast(
            "Unsafe remapping enabled. If you remap Fn, this will change even your factory reset shortcut — be careful!",
            "warning",
            8000,
        );
    }
    window.unsafe = true;
    redrawOptions();
}
window.mode = "win";
window.keyboardInfo = null;
window.lastKey = null;
window.currentKey = null;
window.clickCount = 0;
window.config = new Config();
// Snapshot of the keyboard's on-device state (marshalled form), used to
// compute what a WRITE would actually change.
window.deviceState = { keys: {}, mackeys: {} };

function modifierLabel(modifierID) {
    let modifier = modifiers[modifierID];
    if (!modifier) {
        return modifierID;
    }
    return window.mode === "mac"
        ? modifier.label
        : (modifier.winLabel ?? modifier.label);
}

function toast(message, kind = "info", timeout = 4000) {
    let container = g(".toast-container");
    if (!container) {
        container = n("div", (e) => {
            e.className = "toast-container";
        });
        document.body.appendChild(container);
    }
    container.appendChild(
        n("div", (e) => {
            e.className = `toast ${kind}`;
            e.innerHTML = message;
            setTimeout(() => e.remove(), timeout);
        }),
    );
}

function showErrorPanel(title, message) {
    // Permission errors carry shell commands after a blank line; surface
    // them in a copyable block instead of a wall of text.
    let [text, ...rest] = String(message).split("\n\n");
    let commands = rest.join("\n\n");
    let overlay = n("div", (e) => {
        e.className = "modal-overlay";
        e.onclick = (ev) => {
            if (ev.target === e) {
                e.remove();
            }
        };
        e.appendChild(
            n("div", (card) => {
                card.className = "modal-card card";
                card.appendChild(
                    n("h3", (h) => {
                        h.innerHTML = title;
                    }),
                );
                card.appendChild(
                    n("p", (p) => {
                        p.innerHTML = text;
                    }),
                );
                if (commands) {
                    card.appendChild(
                        n("pre", (pre) => {
                            pre.className = "command-block";
                            pre.innerText = commands;
                        }),
                    );
                }
                card.appendChild(
                    n("p", (row) => {
                        row.className = "modal-buttons";
                        if (commands && navigator.clipboard) {
                            row.appendChild(
                                n("button", (b) => {
                                    b.className = "toolbar-button";
                                    b.innerHTML = "Copy commands";
                                    b.onclick = async () => {
                                        await navigator.clipboard.writeText(
                                            commands,
                                        );
                                        toast("Copied to clipboard", "success");
                                    };
                                }),
                            );
                        }
                        row.appendChild(
                            n("button", (b) => {
                                b.className = "toolbar-button";
                                b.innerHTML = "Close";
                                b.onclick = () => overlay.remove();
                            }),
                        );
                    }),
                );
            }),
        );
    });
    document.body.appendChild(overlay);
}

// KeyboardEvent.code -> nudelta keycode name, for "press a key" capture.
const CAPTURE_CODE_MAP = (() => {
    let map = {
        Escape: "esc",
        Backquote: "grave",
        Tab: "tab",
        CapsLock: "capslock",
        Space: "space",
        Enter: "enter",
        Backspace: "backspace",
        Delete: "del",
        Insert: "ins",
        Home: "home",
        End: "end",
        PageUp: "pgup",
        PageDown: "pgdn",
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        Minus: "minus",
        Equal: "equal",
        BracketLeft: "lbracket",
        BracketRight: "rbracket",
        Backslash: "backslash",
        Semicolon: "semicolon",
        Quote: "quote",
        Comma: "comma",
        Period: "period",
        Slash: "fwdslash",
        ControlLeft: "lctrl",
        ControlRight: "rctrl",
        ShiftLeft: "lshift",
        ShiftRight: "rshift",
        AltLeft: "lalt",
        AltRight: "ralt",
        MetaLeft: "lmeta",
        MetaRight: "rmeta",
        PrintScreen: "sysrq",
        ScrollLock: "scrolllock",
        Pause: "pausebreak",
    };
    for (let i = 0; i < 26; i += 1) {
        let letter = String.fromCharCode(97 + i);
        map[`Key${letter.toUpperCase()}`] = letter;
    }
    for (let i = 0; i <= 9; i += 1) {
        map[`Digit${i}`] = `num${i}`;
    }
    for (let i = 1; i <= 24; i += 1) {
        map[`F${i}`] = `f${i}`;
    }
    return map;
})();

// Display groups for the keycode picker, tried in order; first match wins.
const KEYCODE_GROUPS = [
    ["Letters", /^[a-z]$/],
    ["Numbers", /^num[0-9]$/],
    ["Function keys", /^f([1-9]|1[0-9]|2[0-4])$/],
    ["Modifiers", /^(l|r)(ctrl|shift|alt|meta)$|^(fn|capslock|fnspace)$/],
    [
        "Navigation & editing",
        /^(up|down|left|right|home|end|pgup|pgdn|ins|del|tab|enter|space|backspace|esc|none)$/,
    ],
    [
        "Punctuation",
        /^(minus|equal|lbracket|rbracket|backslash|semicolon|quote|comma|period|fwdslash|grave)$/,
    ],
    ["Backlight", /backlight/],
    ["Media & system", /.*/],
];

function groupKeycodes(keycodes) {
    let groups = KEYCODE_GROUPS.map(([title]) => ({ title, names: [] }));
    for (let name in keycodes) {
        let index = KEYCODE_GROUPS.findIndex(([, pattern]) =>
            pattern.test(name),
        );
        groups[index].names.push(name);
    }
    return groups.filter((group) => group.names.length > 0);
}

function setPickerValue(button, name) {
    button.setAttribute("data-value", name);
    button.innerHTML = name;
}

function openKeycodePicker(alt) {
    let selector = g(alt ? "#keycode-selector-alt" : "#keycode-selector");
    if (!selector || window.keyboardInfo === null) {
        return;
    }
    let keycodes = keyboards[window.keyboardInfo.kind].keycodes;
    let current = selector.getAttribute("data-value");

    let overlay = n("div", (e) => {
        e.className = "modal-overlay";
        e.onclick = (ev) => {
            if (ev.target === e) {
                e.remove();
            }
        };
    });

    let pick = (name) => {
        overlay.remove();
        setPickerValue(selector, name);
        updateKeymap();
    };

    let groupsContainer;
    let render = (filter) => {
        groupsContainer.innerHTML = "";
        let needle = filter.trim().toLowerCase();
        for (let group of groupKeycodes(keycodes)) {
            let names = group.names.filter((name) =>
                name.toLowerCase().includes(needle),
            );
            if (names.length === 0) {
                continue;
            }
            groupsContainer.appendChild(
                n("h4", (h) => {
                    h.innerHTML = group.title;
                }),
            );
            groupsContainer.appendChild(
                n("div", (grid) => {
                    grid.className = "picker-grid";
                    for (let name of names) {
                        grid.appendChild(
                            n("button", (item) => {
                                item.className =
                                    name === current
                                        ? "picker-item current"
                                        : "picker-item";
                                item.innerHTML = name;
                                item.onclick = () => pick(name);
                            }),
                        );
                    }
                }),
            );
        }
        if (groupsContainer.innerHTML === "") {
            groupsContainer.appendChild(
                n("p", (p) => {
                    p.className = "picker-empty";
                    p.innerHTML = "No keycode matches.";
                }),
            );
        }
    };

    overlay.appendChild(
        n("div", (card) => {
            card.className = "modal-card card picker-card";
            card.appendChild(
                n("input", (input) => {
                    input.className = "picker-search";
                    input.setAttribute("type", "search");
                    input.setAttribute("placeholder", "Search keycodes…");
                    input.oninput = () => render(input.value);
                    input.onkeydown = (ev) => {
                        if (ev.key === "Escape") {
                            overlay.remove();
                        } else if (ev.key === "Enter") {
                            let first = overlay.querySelector(".picker-item");
                            if (first) {
                                pick(first.innerHTML);
                            }
                        }
                    };
                }),
            );
            card.appendChild(
                n("div", (e) => {
                    groupsContainer = e;
                    e.className = "picker-groups";
                }),
            );
        }),
    );

    document.body.appendChild(overlay);
    render("");
    overlay.querySelector(".picker-search").focus();
}

function formatRemapEntry(entry) {
    if (!entry) {
        return "default";
    }
    if (typeof entry === "string") {
        return entry;
    }
    if (entry.raw !== undefined && entry.raw !== null) {
        return `0x${entry.raw.toString(16).padStart(8, "0")}`;
    }
    let mods = (entry.modifiers ?? []).map(modifierLabel).join("");
    return `${mods}${entry.key ?? ""}`;
}

function normalizeRemapEntry(entry) {
    if (typeof entry === "string") {
        entry = { key: entry };
    }
    if (entry.raw !== undefined && entry.raw !== null) {
        return JSON.stringify({ raw: entry.raw });
    }
    let normalized = { key: entry.key };
    let mods = [...(entry.modifiers ?? [])].sort();
    if (mods.length) {
        normalized.modifiers = mods;
    }
    return JSON.stringify(normalized);
}

/** What a WRITE would change, relative to the keyboard's current state. */
function computeDiff() {
    let diffs = [];
    let marshalled = window.config.marshall();
    for (let [top, modeLabel] of [
        ["keys", "Win"],
        ["mackeys", "Mac"],
    ]) {
        let current = marshalled[top] ?? {};
        let device = window.deviceState[top] ?? {};
        let ids = new Set([...Object.keys(current), ...Object.keys(device)]);
        for (let id of ids) {
            let from = device[id];
            let to = current[id];
            let same =
                (from ? normalizeRemapEntry(from) : null) ===
                (to ? normalizeRemapEntry(to) : null);
            if (!same) {
                diffs.push({ mode: modeLabel, id, from, to });
            }
        }
    }
    return diffs;
}

async function writeYAML() {
    if (window.keyboardInfo === null) {
        return;
    }
    let marshalled = window.config.marshall();
    window.busy = true;
    redrawOptions();
    try {
        await bridge.writeConfig(marshalled);
        window.deviceState = structuredClone(marshalled);
        toast("Wrote configuration successfully!", "success");
    } catch (err) {
        showErrorPanel("Failed to write configuration", err.message);
        await refreshKeyboard();
    } finally {
        window.busy = false;
        redrawKeyboard();
        redrawOptions();
    }
}

function showWriteConfirmation() {
    let diffs = computeDiff();
    if (diffs.length === 0 || window.keyboardInfo === null || window.busy) {
        return;
    }
    let overlay = n("div", (e) => {
        e.className = "modal-overlay";
        e.onclick = (ev) => {
            if (ev.target === e) {
                e.remove();
            }
        };
        e.appendChild(
            n("div", (card) => {
                card.className = "modal-card card";
                card.appendChild(
                    n("h3", (h) => {
                        h.innerHTML = "Write these changes to the keyboard?";
                    }),
                );
                card.appendChild(
                    n("ul", (ul) => {
                        ul.className = "modal-list";
                        for (let d of diffs) {
                            ul.appendChild(
                                n("li", (li) => {
                                    if (!d.to) {
                                        li.className = "diff-reset";
                                    }
                                    li.innerHTML =
                                        `<span class="diff-mode">${d.mode}</span> ` +
                                        `<b>${d.id}</b>&nbsp;: ` +
                                        `${formatRemapEntry(d.from)} → ${formatRemapEntry(d.to)}`;
                                }),
                            );
                        }
                    }),
                );
                card.appendChild(
                    n("p", (row) => {
                        row.className = "modal-buttons";
                        row.appendChild(
                            n("button", (b) => {
                                b.className = "toolbar-button";
                                b.innerHTML = "Cancel";
                                b.onclick = () => overlay.remove();
                            }),
                        );
                        row.appendChild(
                            n("button", (b) => {
                                b.className = "toolbar-button write-confirm";
                                b.innerHTML = `Write ${diffs.length} change${
                                    diffs.length > 1 ? "s" : ""
                                }`;
                                b.onclick = async () => {
                                    overlay.remove();
                                    await writeYAML();
                                };
                            }),
                        );
                    }),
                );
            }),
        );
    });
    document.body.appendChild(overlay);
}

async function refreshKeyboard(connect = false) {
    try {
        window.keyboardInfo = connect
            ? await bridge.connect()
            : await bridge.getKeyboardInfo();
    } catch (err) {
        window.keyboardInfo = null;
        showErrorPanel("Keyboard error", err.message);
    }
    window.currentKey = null;
    window.deviceState = { keys: {}, mackeys: {} };
    if (window.keyboardInfo !== null) {
        // Seed the UI with the keyboard's actual state, so what you see is
        // what is on the device, and WRITE diffs are meaningful.
        try {
            let current = await bridge.readCurrentRemaps();
            if (current !== null) {
                window.deviceState = structuredClone(current);
                window.config.unmarshall(structuredClone(current));
            }
        } catch (err) {
            console.error("Could not read the current keymap:", err);
        }
    }
    redrawKeyboard();
    redrawOptions();
}

async function openConfigFile(file) {
    let value = await file.text();

    try {
        bridge.validateConfig(value);

        let config = YAML.parse(value);
        window.config.unmarshall(config);
    } catch (err) {
        showErrorPanel("Invalid YAML file", err.message);
    }
}

function downloadYaml(filename, object) {
    let string = YAML.stringify(object);
    let blob = new Blob([string], { type: "application/yaml" });
    let anchor = n("a", (e) => {
        e.href = URL.createObjectURL(blob);
        e.download = filename;
    });
    anchor.click();
    URL.revokeObjectURL(anchor.href);
}

function saveConfigFile() {
    downloadYaml("nudelta.yml", window.config.marshall());
}

async function backupConfigFile() {
    if (window.keyboardInfo === null) {
        toast("Connect a keyboard first.", "warning");
        return;
    }
    try {
        // Read fresh off the device rather than trusting UI state.
        let current = await bridge.readCurrentRemaps();
        if (current === null) {
            toast("The keyboard was unplugged.", "warning");
            return;
        }
        let kind = window.keyboardInfo.kind.toLowerCase();
        let date = new Date().toISOString().slice(0, 10);
        downloadYaml(`${kind}-backup-${date}.yml`, current);
        toast("Backup saved. Keep it somewhere safe!", "success");
    } catch (err) {
        showErrorPanel("Backup failed", err.message);
    }
}

function redrawKeyboard() {
    if (window.keyboardInfo === null) {
        g(".keyboard-container").innerHTML = "";
        g(".switcher").innerHTML = "";
        return;
    }
    let keyboard = keyboards[window.keyboardInfo.kind];
    let container = g(".keyboard-container");
    let remap = window.config.getRemap(window.mode);
    container.innerHTML = "";
    container.appendChild(
        n("div", (e) => {
            e.className = "keyboard card";
            let layout = keyboard.getLayout(window.mode);
            for (let currentRow in layout) {
                currentRow = Number(currentRow);
                let row = layout[currentRow];
                let currentColumn = 1;
                for (let key of row) {
                    e.appendChild(
                        n("div", (e) => {
                            e.id = key.id;
                            let width = key.width * 4;
                            let colorResolved = key.color;
                            let color = `var(--${colorResolved})`;
                            let label = key.label;
                            let labelColor =
                                colorResolved == "white"
                                    ? "var(--gray)"
                                    : "var(--white)";
                            let className = "key";

                            let remapEntry =
                                remap[key.id] ??
                                (key.altID ? remap[key.altID] : null);
                            if (remapEntry ?? false) {
                                className += " modified";
                            }

                            if (key.altLabel) {
                                className += " altlabel";
                            }
                            e.className = className;
                            e.style = `
                                background-color: ${color};
                                grid-column-start: ${currentColumn};
                                grid-column-end: ${currentColumn + width};
                                grid-row-start: ${currentRow + 1};
                                grid-row-end: ${currentRow + 1};
                                ${e.id == "__spacer" ? "display: none;" : ""}
                            `;
                            e.onclick = onClickKey;
                            e.setAttribute("data", JSON.stringify(key));
                            currentColumn += width;
                            e.appendChild(
                                n("span", (e) => {
                                    let styleString = `text-shadow: 0 0 0 ${labelColor};`;
                                    e.style = styleString;
                                    e.innerHTML = label;
                                    if (key.altLabel) {
                                        e.innerHTML = `${key.altLabel} <br /> ${key.label}`;
                                    }
                                }),
                            );
                            if (remapEntry ?? false) {
                                let badgeText = formatRemapEntry(remapEntry);
                                e.title = `${key.name} → ${badgeText}`;
                                e.appendChild(
                                    n("span", (badge) => {
                                        badge.className = "remap-badge";
                                        badge.innerHTML = `→ ${badgeText}`;
                                    }),
                                );
                            }
                        }),
                    );
                }
            }
        }),
    );

    let switcherContainer = g(".switcher");
    switcherContainer.innerHTML = "";
    switcherContainer.appendChild(
        n("span", (e) => {
            e.className =
                window.mode === "win"
                    ? "switcher-label active"
                    : "switcher-label";
            e.innerHTML = "Windows";
        }),
    );
    switcherContainer.appendChild(
        n("label", (e) => {
            e.className = "toggle-switchy";
            e.setAttribute("data-style", "rounded");
            e.setAttribute("for", "mode-switcher");
            e.appendChild(
                n("input", (e) => {
                    e.id = "mode-switcher";
                    e.setAttribute("type", "checkbox");
                    e.checked = window.mode == "mac";
                    e.onchange = (ev) => {
                        window.mode = ev.target.checked ? "mac" : "win";
                        window.currentKey = null;
                        redrawKeyboard();
                        redrawOptions();
                    };
                }),
            );
            e.appendChild(
                n("span", (e) => {
                    e.className = "toggle";
                    e.appendChild(
                        n("span", (e) => {
                            e.className = "switch";
                        }),
                    );
                }),
            );
        }),
    );
    switcherContainer.appendChild(
        n("span", (e) => {
            e.className =
                window.mode === "mac"
                    ? "switcher-label active"
                    : "switcher-label";
            e.innerHTML = "Mac";
        }),
    );
    switcherContainer.appendChild(
        n("p", (e) => {
            e.className = "switcher-note";
            e.innerHTML =
                "You are editing this layout's stored keymap — the active one depends on the keyboard's physical side switch.";
        }),
    );
}

function drawOptionArray(e, remap, key, alt, column, row) {
    let id = alt ? key.altID : key.id;
    let defaultMapping = alt ? key.altDefaultMapping : key.defaultMapping;
    let defaultModifiers = alt ? key.altDefaultModifiers : key.defaultModifiers;

    let currentRemap = {};
    let currentModifiers = defaultModifiers;
    if (remap[id]) {
        currentRemap = remap[id];
        currentModifiers = currentRemap.modifiers ?? [];
    }

    let keycodes = window.keyboardInfo
        ? keyboards[window.keyboardInfo.kind].keycodes
        : [];

    for (let modifierID in modifiers) {
        let modifier = modifiers[modifierID];
        e.appendChild(
            n("div", (e) => {
                if (currentModifiers.indexOf(modifierID) !== -1) {
                    e.className = "key selected";
                } else {
                    e.className = "key";
                }
                let elementID = `modifier-${modifierID}`;
                if (alt) {
                    elementID += "-alt";
                }
                e.id = elementID;
                e.style = `
                    grid-column-start: ${column};
                    grid-column-end: ${column};
                    grid-row-start: ${row};
                    grid-row-end: ${row + 1};
                `;
                e.appendChild(
                    n("span", (e) => {
                        e.innerHTML = modifierLabel(modifierID);
                    }),
                );
                e.onclick = onClickModifier;
            }),
        );
        column += 1;
    }
    e.appendChild(
        n("button", (e) => {
            let elementID = "keycode-selector";
            if (alt) {
                elementID += "-alt";
            }
            e.id = elementID;
            e.className = "keycode-picker-button";
            e.style = `
                grid-column-start: ${column};
                grid-column-end: ${column + 2};
                grid-row-start: ${row};
                grid-row-end: ${row + 1};
            `;
            column += 2;
            let value = currentRemap.key ?? defaultMapping;
            e.setAttribute("data-value", value);
            e.innerHTML = value;
            e.title = "Choose a keycode";
            e.onclick = () => openKeycodePicker(alt);
        }),
    );
    e.appendChild(
        n("button", (btn) => {
            btn.className = "toolbar-button capture-button";
            btn.innerHTML = "⌨";
            btn.title = "Press a key to capture";
            btn.style = `
                grid-column-start: ${column};
                grid-column-end: ${column + 1};
                grid-row-start: ${row};
                grid-row-end: ${row + 1};
            `;
            btn.onclick = () => startKeyCapture(alt, btn);
        }),
    );
    column += 1;

    return column;
}

function startKeyCapture(alt, button) {
    if (window.captureCleanup) {
        window.captureCleanup();
    }
    button.classList.add("listening");
    button.innerHTML = "…";

    let timeoutID;
    let cleanup = () => {
        document.removeEventListener("keydown", handler, true);
        clearTimeout(timeoutID);
        button.classList.remove("listening");
        button.innerHTML = "⌨";
        window.captureCleanup = null;
    };
    let handler = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        cleanup();
        let name = CAPTURE_CODE_MAP[ev.code];
        let selector = g(alt ? "#keycode-selector-alt" : "#keycode-selector");
        if (!name || !selector) {
            toast(`No mapping for the "${ev.code}" key.`, "warning");
            return;
        }
        let keycodes = keyboards[window.keyboardInfo.kind].keycodes;
        if (!(name in keycodes)) {
            toast(`"${name}" is not available on this keyboard.`, "warning");
            return;
        }
        setPickerValue(selector, name);
        updateKeymap();
    };
    window.captureCleanup = cleanup;
    document.addEventListener("keydown", handler, true);
    timeoutID = setTimeout(cleanup, 5000);
}

function redrawOptions() {
    let container = g(".option-container");
    container.innerHTML = "";

    if (window.keyboardInfo === null) {
        container.appendChild(
            n("div", (e) => {
                e.style = `
                grid-column-start: 1;
                grid-column-end: 1;
                grid-row-start: 1;
                grid-row-end: 1;
            `;
                e.className = "keyboard-field";
                e.appendChild(
                    n("p", (e) => {
                        e.innerHTML = bridge.isSupported()
                            ? "No supported keyboard connected.<br />Make sure it's plugged in via USB, then click “Connect Keyboard”."
                            : "This browser does not support WebHID.<br />Please use a Chromium-based browser (Chrome, Edge, Brave…) or the Nudelta desktop app.";
                    }),
                );
            }),
        );
        return;
    }

    let remap = window.config.getRemap(window.mode);
    container.appendChild(
        n("div", (e) => {
            e.className = "option-matrix card";
            let key = window.currentKey;
            let columnCount = 1;
            let remappable = (key && key.remappable) || window.unsafe;
            if (key && remappable) {
                let altIDExists = !!key.altID;

                columnCount = drawOptionArray(
                    e,
                    remap,
                    key,
                    false,
                    1,
                    altIDExists ? 2 : 3,
                );
                e.appendChild(
                    n("h3", (e) => {
                        e.style = `
                            grid-column-start: 1;
                            grid-column-end: ${columnCount};
                            grid-row-start: ${altIDExists ? 1 : 2};
                            grid-row-end: ${altIDExists ? 2 : 3};
                        `;
                        e.innerHTML = `${key.name}`;
                    }),
                );
                if (altIDExists) {
                    columnCount = drawOptionArray(e, remap, key, true, 1, 4);
                    e.appendChild(
                        n("h3", (e) => {
                            e.style = `
                                grid-column-start: 1;
                                grid-column-end: ${columnCount};
                                grid-row-start: 3;
                                grid-row-end: 4;
                            `;
                            e.innerHTML = `${key.altName}`;
                        }),
                    );
                } else {
                    e.appendChild(
                        n("h3", (e) => {
                            e.style = `
                                grid-column-start: 1;
                                grid-column-end: ${columnCount};
                                grid-row-start: 4;
                                grid-row-end: 5;
                            `;
                        }),
                    );
                }
            } else if (key && !remappable) {
                e.appendChild(
                    n("h3", (e) => {
                        e.style = `
                            grid-column-start: 1;
                            grid-column-end: ${columnCount + 6};
                            grid-row-start: 2;
                            grid-row-end: 5;
                        `;
                        e.innerHTML = `The ${key.name} key cannot be remapped.`;
                    }),
                );
                columnCount += 6;
            } else {
                e.appendChild(
                    n("h3", (e) => {
                        e.style = `
                            grid-column-start: 1;
                            grid-column-end: ${columnCount + 6};
                            grid-row-start: 2;
                            grid-row-end: 5;
                        `;
                        e.id = "no-key-selected";
                        e.innerHTML = "No key selected.";
                    }),
                );
                columnCount += 6;
            }

            columnCount += 1;

            e.appendChild(
                n("div", (e) => {
                    e.style = `
                        grid-column-start: ${columnCount};
                        grid-column-end: ${columnCount + 3};
                        grid-row-start: 2;
                        grid-row-end: 3;
                    `;
                    e.className = "keyboard-field";
                    e.appendChild(
                        n("p", (e) => {
                            e.innerHTML = window.keyboardInfo.info;
                        }),
                    );
                    e.appendChild(
                        n("p", (e) => {
                            let count = computeDiff().length;
                            e.className = "sync-status";
                            e.innerHTML =
                                count === 0
                                    ? "In sync with keyboard"
                                    : `${count} unwritten change${
                                          count > 1 ? "s" : ""
                                      }`;
                            if (count > 0) {
                                e.className += " dirty";
                            }
                        }),
                    );
                }),
            );

            e.appendChild(
                n("div", (e) => {
                    let diffCount = computeDiff().length;
                    e.className = `key write-key`;
                    if (
                        window.keyboardInfo !== null &&
                        diffCount > 0 &&
                        !window.busy
                    ) {
                        e.className = `key write-key active`;
                    }
                    e.style = `
                        grid-column-start: ${columnCount};
                        grid-column-end: ${columnCount + 3};
                        grid-row-start: 3;
                        grid-row-end: 4;
                    `;
                    e.appendChild(
                        n("p", (e) => {
                            e.innerHTML = window.busy
                                ? "WRITING…"
                                : diffCount > 0
                                  ? `WRITE (${diffCount})`
                                  : "WRITE";
                        }),
                    );
                    e.onclick = showWriteConfirmation;
                }),
            );
        }),
    );
}

function setsEqual(lhs, rhs) {
    const _difference = new Set(lhs);
    for (const elem of rhs) {
        if (_difference.has(elem)) {
            _difference.delete(elem);
        } else {
            _difference.add(elem);
        }
    }
    return _difference.size == 0;
}

/**
 *
 * @param {Event} event
 */
function updateKeymap(event) {
    let remap = window.config.getRemap(window.mode);
    let key = window.currentKey;

    let currentRemap = remap[key.id] ?? {};

    let incomingID = g("#keycode-selector").getAttribute("data-value");
    let incomingModifiers = new Set();
    let defaultModifiers = new Set(key.defaultModifiers);
    for (let modifier in modifiers) {
        let modifierNode = g(`#modifier-${modifier}`);
        let selected = modifierNode.className.includes("selected");
        if (selected) {
            incomingModifiers.add(modifier);
        }
    }

    let modifiersEqual = setsEqual(incomingModifiers, defaultModifiers);

    if (incomingID == key.defaultMapping && modifiersEqual) {
        remap[key.id] = {};
        delete remap[key.id];
    } else {
        currentRemap.key = incomingID;
        currentRemap.modifiers = [...incomingModifiers];
        if (modifiersEqual) {
            delete currentRemap.modifiers;
        }
        remap[key.id] = currentRemap;
    }

    if (key.altID) {
        let currentRemap = remap[key.altID] ?? {};
        let incomingID = g("#keycode-selector-alt").getAttribute("data-value");
        let incomingModifiers = new Set();
        let defaultModifiers = new Set(key.altDefaultModifiers);
        for (let modifier in modifiers) {
            let modifierNode = g(`#modifier-${modifier}-alt`);
            let selected = modifierNode.className.includes("selected");
            if (selected) {
                incomingModifiers.add(modifier);
            }
        }

        let modifiersEqual = setsEqual(incomingModifiers, defaultModifiers);

        if (incomingID == key.altDefaultMapping && modifiersEqual) {
            remap[key.altID] = {};
            delete remap[key.altID];
        } else {
            currentRemap.key = incomingID;
            currentRemap.modifiers = [...incomingModifiers];
            if (modifiersEqual) {
                delete currentRemap.modifiers;
            }
            remap[key.altID] = currentRemap;
        }
    }
    window.config.setRemap(window.mode, remap);
}

/**
 *
 * @param {MouseEvent} event
 */
function onClickModifier(event) {
    let target = event.target;
    if (target.className.includes("selected")) {
        target.className = "key";
    } else {
        target.className = "key selected";
    }

    updateKeymap();
}

/**
 *
 * @param {MouseEvent} event
 */
function onClickKey(event) {
    window.lastKey = window.currentKey;
    window.currentKey = JSON.parse(event.currentTarget.getAttribute("data"));
    if (window.lastKey && window.lastKey.id == window.currentKey.id) {
        window.clickCount += 1;
    } else {
        window.clickCount = 1;
    }
    if (!window.currentKey.remappable) {
        let remap = window.config.getRemap(window.mode);

        if (remap[window.currentKey.id]) {
            safetyOff(true);
        } else if (window.clickCount == 5) {
            safetyOff();
        }
    }
    redrawOptions();
}

function toolbarButton(label, onclick) {
    return n("button", (e) => {
        e.className = "toolbar-button";
        e.innerHTML = label;
        e.onclick = onclick;
    });
}

async function main() {
    let app = g(".app");

    app.appendChild(
        n("div", (e) => {
            e.style = "padding-top: 10px;";
            e.appendChild(
                n("h1", (e) => {
                    e.innerHTML = "νδ";
                }),
            );
        }),
    );

    app.appendChild(
        n("p", (e) => {
            e.className = "toolbar";
            e.appendChild(
                toolbarButton("Connect Keyboard", () => refreshKeyboard(true)),
            );
            e.appendChild(
                toolbarButton("Open…", () => {
                    if (window.keyboardInfo === null) {
                        toast(
                            "Connect a keyboard first: profiles are validated against it.",
                            "warning",
                        );
                        return;
                    }
                    let input = n("input", (e) => {
                        e.setAttribute("type", "file");
                        e.setAttribute("accept", ".yml,.yaml");
                        e.onchange = () => {
                            if (input.files.length !== 0) {
                                openConfigFile(input.files[0]);
                            }
                        };
                    });
                    input.click();
                }),
            );
            e.appendChild(toolbarButton("Save…", saveConfigFile));
            e.appendChild(toolbarButton("Backup…", backupConfigFile));
        }),
    );

    app.appendChild(
        n("p", (e) => {
            e.appendChild(
                n("div", (e) => {
                    e.className = "keyboard-container";
                }),
            );
        }),
    );

    app.appendChild(
        n("p", (e) => {
            e.className = "switcher";
        }),
    );

    app.appendChild(
        n("p", (e) => {
            e.appendChild(
                n("div", (e) => {
                    e.className = "option-container";
                }),
            );
        }),
    );

    if (bridge.isSupported()) {
        navigator.hid.addEventListener("connect", () => refreshKeyboard());
        navigator.hid.addEventListener("disconnect", () => refreshKeyboard());
        await refreshKeyboard();
    } else {
        redrawOptions();
    }
}

main();
