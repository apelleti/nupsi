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
// The renderer talks to the keyboard directly over WebHID via ./bridge.js.
"use strict";
import "@fontsource/nunito/500.css";
import "@fontsource/nunito/800.css";
import "./app.css";

import YAML from "yaml";
import * as bridge from "./bridge.js";
import keyboards from "./keyboards.js";
import modifiers from "./modifiers.js";
import { g, n } from "./tinydom.js";

// --- state --------------------------------------------------------------

class Config {
    constructor() {
        this.winRemap = {};
        this.macRemap = {};
    }
    getRemap(mode) {
        return Object.assign(
            {},
            mode === "mac" ? this.macRemap : this.winRemap,
        );
    }
    setRemap(mode, incoming) {
        if (mode === "mac") {
            this.macRemap = incoming;
        } else {
            this.winRemap = incoming;
        }
        render();
    }
    unmarshall(config) {
        let normalize = (section) => {
            section = section ?? {};
            for (let key in section) {
                if (typeof section[key] === "string") {
                    section[key] = { key: section[key] };
                }
            }
            return section;
        };
        this.winRemap = normalize(config.keys);
        this.macRemap = normalize(config.mackeys);
    }
    marshall() {
        return { keys: this.winRemap, mackeys: this.macRemap };
    }
}

window.mode = "win";
window.keyboardInfo = null;
window.currentKey = null;
window.lastKey = null;
window.clickCount = 0;
window.unsafe = false;
window.busy = false;
window.config = new Config();
// Snapshot of the keyboard's on-device state, to compute what a WRITE changes.
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

// --- small UI primitives ------------------------------------------------

function button(label, onclick, className = "button") {
    return n("button", (e) => {
        e.className = className;
        e.innerHTML = label;
        e.onclick = onclick;
    });
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

function modal(build) {
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
                build(card, () => e.remove());
            }),
        );
    });
    document.body.appendChild(overlay);
    return overlay;
}

function showErrorPanel(title, message) {
    // Permission errors carry shell commands after a blank line; surface them
    // in a copyable block instead of a wall of text.
    let [text, ...rest] = String(message).split("\n\n");
    let commands = rest.join("\n\n");
    modal((card, close) => {
        card.appendChild(n("h3", (h) => (h.textContent = title)));
        // textContent, not innerHTML: `text` can contain device-provided
        // strings (e.g. an HID product name) or YAML file contents.
        card.appendChild(n("p", (p) => (p.textContent = text)));
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
                        button("Copy commands", async () => {
                            await navigator.clipboard.writeText(commands);
                            toast("Copied to clipboard", "success");
                        }),
                    );
                }
                row.appendChild(button("Close", close));
            }),
        );
    });
}

// --- keycode picker -----------------------------------------------------

// KeyboardEvent.code -> internal keycode name, for "press a key" capture.
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

function setPickerValue(pickerButton, name) {
    pickerButton.setAttribute("data-value", name);
    // Choosing a named keycode clears any raw value it replaces.
    pickerButton.removeAttribute("data-raw");
    pickerButton.classList.remove("raw");
    pickerButton.textContent = name;
}

function openKeycodePicker(alt) {
    let selector = g(alt ? "#keycode-selector-alt" : "#keycode-selector");
    if (!selector || window.keyboardInfo === null) {
        return;
    }
    let keycodes = keyboards[window.keyboardInfo.kind].keycodes;
    let current = selector.getAttribute("data-value");

    // Declared before modal() because its build callback runs synchronously
    // and references these.
    let overlay;
    let groupsContainer;
    let pick = (name) => {
        overlay.remove();
        setPickerValue(selector, name);
        updateKeymap();
    };
    let renderGroups = (filter) => {
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
                n("h4", (h) => (h.innerHTML = group.title)),
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
                                item.setAttribute("data-value", name);
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

    overlay = modal((card) => {
        card.classList.add("picker-card");
        card.appendChild(
            n("input", (input) => {
                input.className = "picker-search";
                input.setAttribute("type", "search");
                input.setAttribute("placeholder", "Search keycodes…");
                input.oninput = () => renderGroups(input.value);
                input.onkeydown = (ev) => {
                    if (ev.key === "Escape") {
                        overlay.remove();
                    } else if (ev.key === "Enter") {
                        let first = overlay.querySelector(".picker-item");
                        if (first) {
                            pick(first.getAttribute("data-value"));
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
    });

    renderGroups("");
    overlay.querySelector(".picker-search").focus();
}

function startKeyCapture(alt, captureButton) {
    if (window.captureCleanup) {
        window.captureCleanup();
    }
    captureButton.classList.add("listening");
    captureButton.innerHTML = "…";

    let timeoutID;
    let cleanup = () => {
        document.removeEventListener("keydown", handler, true);
        clearTimeout(timeoutID);
        captureButton.classList.remove("listening");
        captureButton.innerHTML = "⌨";
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
        toast(`Captured “${name}”.`, "success", 2000);
    };
    window.captureCleanup = cleanup;
    document.addEventListener("keydown", handler, true);
    timeoutID = setTimeout(cleanup, 5000);
}

// --- remap representation & diff ----------------------------------------

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
        ["keys", "Windows"],
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

// --- device operations --------------------------------------------------

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
    // Reset edits too: otherwise a failed read below would leave the previous
    // session's config in place, showing phantom changes and risking a Write
    // of stale data to the new keyboard.
    window.config.unmarshall({});
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
            toast(
                "Connected, but couldn't read the current keymap.",
                "warning",
            );
        }
    }
    render();
}

function showWriteConfirmation() {
    let diffs = computeDiff();
    if (diffs.length === 0 || window.keyboardInfo === null || window.busy) {
        return;
    }
    let overlay = modal((card, close) => {
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
                row.appendChild(button("Cancel", close));
                row.appendChild(
                    button(
                        `Write ${diffs.length} change${diffs.length > 1 ? "s" : ""}`,
                        async () => {
                            close();
                            await writeYAML();
                        },
                        "button primary",
                    ),
                );
            }),
        );
    });
    return overlay;
}

async function writeYAML() {
    if (window.keyboardInfo === null) {
        return;
    }
    let marshalled = window.config.marshall();
    window.busy = true;
    render();
    try {
        await bridge.writeConfig(marshalled);
        window.deviceState = structuredClone(marshalled);
        toast("Wrote configuration successfully!", "success");
    } catch (err) {
        showErrorPanel("Failed to write configuration", err.message);
        await refreshKeyboard();
    } finally {
        window.busy = false;
        render();
    }
}

function revertChanges() {
    if (computeDiff().length === 0) {
        return;
    }
    window.config.unmarshall(structuredClone(window.deviceState));
    window.currentKey = null;
    toast("Reverted to the keyboard's current state.", "info", 2500);
    render();
}

async function openConfigFile(file) {
    let value = await file.text();
    try {
        bridge.validateConfig(value);
        window.config.unmarshall(YAML.parse(value));
        toast("Profile loaded. Review the changes, then Write.", "success");
    } catch (err) {
        showErrorPanel("Invalid YAML file", err.message);
    }
}

function pickConfigFile() {
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
    downloadYaml("nupsi.yml", window.config.marshall());
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

// --- rendering ----------------------------------------------------------

function segmented(options, current, onSelect) {
    return n("div", (seg) => {
        seg.className = "segmented";
        for (let [value, label] of options) {
            seg.appendChild(
                button(
                    label,
                    () => {
                        if (value !== current) {
                            onSelect(value);
                        }
                    },
                    value === current ? "seg-item active" : "seg-item",
                ),
            );
        }
    });
}

function renderStatus() {
    let pill = g(".status-pill");
    pill.innerHTML = "";
    let connected = window.keyboardInfo !== null;
    pill.className = connected ? "status-pill connected" : "status-pill";
    pill.appendChild(n("span", (dot) => (dot.className = "status-dot")));
    pill.appendChild(
        n("span", (label) => {
            label.innerHTML = connected
                ? window.keyboardInfo.kind
                : "Not connected";
        }),
    );
}

function renderOnboarding() {
    let container = g(".onboarding");
    container.innerHTML = "";
    let supported = bridge.isSupported();
    container.appendChild(
        n("div", (card) => {
            card.className = "onboarding-card card";
            card.appendChild(
                n("div", (e) => (e.className = "onboarding-logo")),
            );
            card.appendChild(
                n("h2", (h) => {
                    h.innerHTML = supported
                        ? "Connect your NuPhy keyboard"
                        : "Unsupported browser";
                }),
            );
            card.appendChild(
                n("p", (p) => {
                    p.className = "onboarding-text";
                    p.innerHTML = supported
                        ? "Plug your Air75, Air60 or Halo75 (V1) in over USB, then click below and pick it from the list."
                        : "This app talks to your keyboard through WebHID, which only Chromium-based browsers support. Please open it in Chrome, Edge or Brave.";
                }),
            );
            if (supported) {
                card.appendChild(
                    button(
                        "Connect keyboard",
                        () => refreshKeyboard(true),
                        "button primary large",
                    ),
                );
                card.appendChild(
                    n("p", (p) => {
                        p.className = "onboarding-note";
                        p.innerHTML =
                            "On Linux you may need a udev rule first — the app will tell you the exact command if so.";
                    }),
                );
            }
            card.appendChild(
                n("p", (p) => {
                    p.className = "onboarding-credit";
                    p.appendChild(
                        document.createTextNode(
                            "Nupsi is an open-source port of ",
                        ),
                    );
                    p.appendChild(
                        n("a", (a) => {
                            a.href = "https://github.com/donn/nudelta";
                            a.target = "_blank";
                            a.rel = "noopener noreferrer";
                            a.textContent = "nudelta";
                        }),
                    );
                    p.appendChild(
                        document.createTextNode(" by Mohamed Gaber."),
                    );
                }),
            );
        }),
    );
}

function renderToolbar() {
    let toolbar = g(".toolbar");
    toolbar.innerHTML = "";

    toolbar.appendChild(
        n("div", (group) => {
            group.className = "toolbar-group";
            group.appendChild(
                n("span", (l) => {
                    l.className = "toolbar-label";
                    l.innerHTML = "Editing";
                }),
            );
            group.appendChild(
                segmented(
                    [
                        ["win", "Windows"],
                        ["mac", "Mac"],
                    ],
                    window.mode,
                    (value) => {
                        window.mode = value;
                        window.currentKey = null;
                        render();
                    },
                ),
            );
        }),
    );

    toolbar.appendChild(
        n("div", (group) => {
            group.className = "toolbar-group toolbar-actions";
            group.appendChild(button("Open…", pickConfigFile));
            group.appendChild(button("Save…", saveConfigFile));
            group.appendChild(button("Backup…", backupConfigFile));
        }),
    );
}

function renderKeyboard() {
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
                            let color = `var(--${key.color})`;
                            let labelColor =
                                key.color == "white"
                                    ? "var(--gray)"
                                    : "var(--white)";
                            let className = "key";
                            let remapEntry =
                                remap[key.id] ??
                                (key.altID ? remap[key.altID] : null);
                            if (remapEntry ?? false) {
                                className += " modified";
                            }
                            if (
                                window.currentKey &&
                                window.currentKey.id === key.id
                            ) {
                                className += " selected";
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
                                    e.style = `text-shadow: 0 0 0 ${labelColor};`;
                                    e.innerHTML = key.altLabel
                                        ? `${key.altLabel} <br /> ${key.label}`
                                        : key.label;
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

    g(".keyboard-caption").innerHTML =
        "Editing the <b>" +
        (window.mode === "mac" ? "Mac" : "Windows") +
        "</b> keymap — the one that's live depends on the keyboard's physical side switch.";
}

function renderKeyEditor(container, key, alt) {
    let remap = window.config.getRemap(window.mode);
    let id = alt ? key.altID : key.id;
    let name = alt ? key.altName : key.name;
    let defaultMapping = alt ? key.altDefaultMapping : key.defaultMapping;
    let defaultModifiers = alt ? key.altDefaultModifiers : key.defaultModifiers;

    let currentRemap = remap[id] ?? {};
    let currentModifiers = remap[id]
        ? (currentRemap.modifiers ?? [])
        : defaultModifiers;
    let isRaw = currentRemap.raw !== undefined && currentRemap.raw !== null;
    let value = currentRemap.key ?? defaultMapping;
    let rawLabel = isRaw
        ? `0x${currentRemap.raw.toString(16).padStart(8, "0")}`
        : null;

    container.appendChild(
        n("div", (row) => {
            row.className = "editor-row";
            row.appendChild(
                n("span", (l) => {
                    l.className = "editor-key-name";
                    l.innerHTML = name;
                }),
            );
            row.appendChild(
                n("span", (a) => {
                    a.className = "editor-arrow";
                    a.innerHTML = "→";
                }),
            );
            row.appendChild(
                n("button", (pickerButton) => {
                    pickerButton.id = alt
                        ? "keycode-selector-alt"
                        : "keycode-selector";
                    pickerButton.className = "keycode-picker-button";
                    if (isRaw) {
                        // Raw (unnameable) word: show the hex and remember it,
                        // with no named value. Picking a keycode replaces it.
                        pickerButton.classList.add("raw");
                        pickerButton.setAttribute("data-value", "");
                        pickerButton.setAttribute(
                            "data-raw",
                            String(currentRemap.raw),
                        );
                        pickerButton.textContent = rawLabel;
                        pickerButton.title =
                            "Raw value — choose a keycode to replace it";
                    } else {
                        pickerButton.setAttribute("data-value", value);
                        pickerButton.textContent = value;
                        pickerButton.title = "Choose a keycode";
                    }
                    pickerButton.onclick = () => openKeycodePicker(alt);
                }),
            );
            row.appendChild(
                n("button", (captureButton) => {
                    captureButton.className = "icon-button";
                    captureButton.innerHTML = "⌨";
                    captureButton.title = "Press a key to capture";
                    captureButton.onclick = () =>
                        startKeyCapture(alt, captureButton);
                }),
            );
            row.appendChild(
                n("div", (chips) => {
                    chips.className = "modifier-chips";
                    for (let modifierID in modifiers) {
                        chips.appendChild(
                            n("button", (chip) => {
                                chip.id = alt
                                    ? `modifier-${modifierID}-alt`
                                    : `modifier-${modifierID}`;
                                chip.className =
                                    currentModifiers.indexOf(modifierID) !== -1
                                        ? "modifier-chip selected"
                                        : "modifier-chip";
                                chip.innerHTML = modifierLabel(modifierID);
                                chip.onclick = onClickModifier;
                            }),
                        );
                    }
                }),
            );
        }),
    );
}

function renderEditor() {
    let container = g(".editor-container");
    container.innerHTML = "";
    let key = window.currentKey;
    let remappable = (key && key.remappable) || window.unsafe;

    if (!key) {
        container.appendChild(
            n("div", (e) => {
                e.className = "editor-hint card";
                e.innerHTML =
                    "Click a key above to remap it. Your changes stay on screen until you press <b>Write</b>.";
            }),
        );
        return;
    }
    if (!remappable) {
        container.appendChild(
            n("div", (e) => {
                e.className = "editor-hint card";
                e.innerHTML = `The <b>${key.name}</b> key cannot be remapped.`;
            }),
        );
        return;
    }

    container.appendChild(
        n("div", (card) => {
            card.className = "editor-card card";
            renderKeyEditor(card, key, false);
            if (key.altID) {
                card.appendChild(
                    n("div", (d) => (d.className = "editor-divider")),
                );
                renderKeyEditor(card, key, true);
            }
        }),
    );
}

function renderActionBar() {
    let bar = g(".action-bar");
    bar.innerHTML = "";
    let count = computeDiff().length;

    bar.appendChild(
        n("span", (status) => {
            status.className = count > 0 ? "sync-status dirty" : "sync-status";
            status.innerHTML =
                count === 0
                    ? "✓ In sync with keyboard"
                    : `● ${count} unwritten change${count > 1 ? "s" : ""}`;
        }),
    );
    bar.appendChild(
        n("div", (group) => {
            group.className = "action-buttons";
            let revert = button("Revert", revertChanges);
            revert.disabled = count === 0 || window.busy;
            group.appendChild(revert);
            let write = button(
                window.busy
                    ? "Writing…"
                    : count > 0
                      ? `Write ${count} change${count > 1 ? "s" : ""}`
                      : "Write",
                showWriteConfirmation,
                "button primary",
            );
            write.disabled = count === 0 || window.busy;
            group.appendChild(write);
        }),
    );
}

/** Master render: toggles onboarding vs workspace and repaints dynamic parts. */
function render() {
    // Any pending key-capture is tied to the editor being rebuilt here; cancel
    // it so a late keypress can't land on a different key (or a null one).
    if (window.captureCleanup) {
        window.captureCleanup();
    }
    let connected = window.keyboardInfo !== null;
    g(".onboarding").style.display = connected ? "none" : "flex";
    g(".workspace").style.display = connected ? "block" : "none";
    g(".action-bar").style.display = connected ? "flex" : "none";
    renderStatus();
    if (connected) {
        renderToolbar();
        renderKeyboard();
        renderEditor();
        renderActionBar();
    } else {
        renderOnboarding();
    }
}

// --- editing events -----------------------------------------------------

function setsEqual(lhs, rhs) {
    const diff = new Set(lhs);
    for (const elem of rhs) {
        if (diff.has(elem)) {
            diff.delete(elem);
        } else {
            diff.add(elem);
        }
    }
    return diff.size == 0;
}

function readEditorInto(
    remap,
    id,
    selectorID,
    modifierSuffix,
    defaultMapping,
    defaultModifiers,
) {
    let currentRemap = remap[id] ?? {};
    let selectorNode = g(`#${selectorID}`);
    let incomingID = selectorNode.getAttribute("data-value");
    let rawAttr = selectorNode.getAttribute("data-raw");
    // A raw value left untouched (no keycode chosen) is preserved as-is.
    if (rawAttr !== null && !incomingID) {
        remap[id] = { raw: Number(rawAttr) };
        return;
    }
    let incomingModifiers = new Set();
    for (let modifier in modifiers) {
        let node = g(`#modifier-${modifier}${modifierSuffix}`);
        if (node && node.className.includes("selected")) {
            incomingModifiers.add(modifier);
        }
    }
    let modifiersEqual = setsEqual(
        incomingModifiers,
        new Set(defaultModifiers),
    );
    if (incomingID == defaultMapping && modifiersEqual) {
        delete remap[id];
    } else {
        currentRemap.key = incomingID;
        currentRemap.modifiers = [...incomingModifiers];
        // Only omit the field when there are truly no modifiers. Stripping it
        // whenever it merely equals the defaults dropped the modifiers from
        // the written keycode and produced phantom "unwritten change" diffs
        // for keys whose default mapping carries modifiers (e.g. screenshot).
        if (incomingModifiers.size === 0) {
            delete currentRemap.modifiers;
        }
        remap[id] = currentRemap;
    }
}

function updateKeymap() {
    let remap = window.config.getRemap(window.mode);
    let key = window.currentKey;

    readEditorInto(
        remap,
        key.id,
        "keycode-selector",
        "",
        key.defaultMapping,
        key.defaultModifiers,
    );
    if (key.altID) {
        readEditorInto(
            remap,
            key.altID,
            "keycode-selector-alt",
            "-alt",
            key.altDefaultMapping,
            key.altDefaultModifiers,
        );
    }
    window.config.setRemap(window.mode, remap);
}

function onClickModifier(event) {
    event.currentTarget.classList.toggle("selected");
    updateKeymap();
}

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
    render();
}

function safetyOff(silent = false) {
    if (!silent) {
        toast(
            "Advanced remapping enabled. If you remap Fn, this changes even your factory-reset shortcut — be careful!",
            "warning",
            8000,
        );
    }
    window.unsafe = true;
    render();
}

// --- keyboard test area -------------------------------------------------

// A scratch input to physically try out remaps. It shows what the OS
// actually receives (character + physical position) for the last key, which
// is the ground truth once a keymap is written to the keyboard.
function buildTestArea() {
    let readout;
    return n("div", (card) => {
        card.className = "test-area card";
        card.appendChild(
            n("div", (headerRow) => {
                headerRow.className = "test-header";
                headerRow.appendChild(
                    n("span", (l) => {
                        l.className = "test-label";
                        l.innerHTML = "Try your keyboard";
                    }),
                );
                headerRow.appendChild(
                    n("span", (hint) => {
                        hint.className = "test-hint";
                        hint.innerHTML =
                            "Type here after writing a remap to check it physically.";
                    }),
                );
            }),
        );
        card.appendChild(
            n("textarea", (ta) => {
                ta.className = "test-input";
                ta.setAttribute("rows", "3");
                ta.setAttribute("placeholder", "Click here and type…");
                ta.setAttribute("spellcheck", "false");
                ta.onkeydown = (ev) => {
                    // Build with textContent: ev.key is arbitrary text.
                    readout.innerHTML = "";
                    readout.append(
                        document.createTextNode("character "),
                        n(
                            "b",
                            (b) =>
                                (b.textContent =
                                    ev.key === " " ? "space" : ev.key),
                        ),
                        document.createTextNode(" · physical position "),
                        n("b", (b) => (b.textContent = ev.code || "—")),
                    );
                };
            }),
        );
        card.appendChild(
            n("p", (e) => {
                readout = e;
                e.className = "test-readout";
                e.innerHTML = "Last key: —";
            }),
        );
    });
}

// --- bootstrap ----------------------------------------------------------

function main() {
    let app = g(".app");
    app.innerHTML = "";

    app.appendChild(
        n("header", (header) => {
            header.className = "app-header";
            header.appendChild(
                n("div", (brand) => {
                    brand.className = "brand";
                    brand.appendChild(
                        n("span", (mark) => {
                            mark.className = "brand-mark";
                            mark.innerHTML = "νδ";
                        }),
                    );
                    brand.appendChild(
                        n("span", (title) => {
                            title.className = "brand-title";
                            title.innerHTML = "Nupsi";
                        }),
                    );
                }),
            );
            header.appendChild(
                n("div", (right) => {
                    right.className = "header-right";
                    right.appendChild(
                        n("a", (link) => {
                            link.className = "github-link";
                            link.href =
                                "https://github.com/apelleti/nyphy-console";
                            link.target = "_blank";
                            link.rel = "noopener noreferrer";
                            link.title = "View the source on GitHub";
                            link.textContent = "GitHub";
                        }),
                    );
                    right.appendChild(
                        n("div", (pill) => (pill.className = "status-pill")),
                    );
                }),
            );
        }),
    );

    app.appendChild(n("div", (e) => (e.className = "onboarding")));

    app.appendChild(
        n("main", (workspace) => {
            workspace.className = "workspace";
            workspace.appendChild(n("div", (e) => (e.className = "toolbar")));
            workspace.appendChild(
                n("div", (e) => (e.className = "keyboard-container")),
            );
            workspace.appendChild(
                n("p", (e) => (e.className = "keyboard-caption")),
            );
            workspace.appendChild(
                n("div", (e) => (e.className = "editor-container")),
            );
            workspace.appendChild(buildTestArea());
        }),
    );

    app.appendChild(n("footer", (e) => (e.className = "action-bar")));

    if (bridge.isSupported()) {
        navigator.hid.addEventListener("connect", () => refreshKeyboard());
        navigator.hid.addEventListener("disconnect", () => refreshKeyboard());
        refreshKeyboard();
    } else {
        render();
    }
}

main();
