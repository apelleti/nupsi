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
// Converts the YAML keyboard data in ../res (the source of truth, shared with
// the C++ implementation) into typed TypeScript modules under
// packages/core/src/data. Re-run with `pnpm gen` after editing res/.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const resDir = join(here, "..", "res");
const outDir = join(here, "..", "packages", "core", "src", "data");

mkdirSync(outDir, { recursive: true });

const banner = `// GENERATED FILE - DO NOT EDIT.
// Source: res/ (YAML). Regenerate with \`pnpm gen\` in ts/.
`;

const hex = (n) => `0x${(n >>> 0).toString(16).padStart(8, "0")}`;

function loadYAML(...segments) {
    return YAML.parse(readFileSync(join(resDir, ...segments), "utf8"));
}

function emitKeymapList(name, list) {
    const body = list.map((n) => `    ${hex(n)},`).join("\n");
    return `export const ${name}: readonly number[] = [\n${body}\n];\n`;
}

function emitNameMap(name, map, valueFormat = (v) => String(v)) {
    const body = Object.entries(map)
        .map(([k, v]) => `    ${JSON.stringify(k)}: ${valueFormat(v)},`)
        .join("\n");
    return `export const ${name}: Readonly<Record<string, number>> = {\n${body}\n};\n`;
}

for (const board of ["Air75", "Air60", "Halo75"]) {
    let out = banner;
    out += emitKeymapList(
        "defaultKeymapWin",
        loadYAML(board, "default_keymap_win.yml"),
    );
    out += emitKeymapList(
        "defaultKeymapMac",
        loadYAML(board, "default_keymap_mac.yml"),
    );
    out += emitNameMap(
        "indicesByKeyNameWin",
        loadYAML(board, "indices_win.yml"),
    );
    out += emitNameMap(
        "indicesByKeyNameMac",
        loadYAML(board, "indices_mac.yml"),
    );
    writeFileSync(join(outDir, `${board.toLowerCase()}.ts`), out);
    console.log(`Wrote data/${board.toLowerCase()}.ts`);
}

{
    let out = banner;
    out += emitNameMap(
        "keycodesByKeyName",
        loadYAML("NuPhy", "keycodes.yml"),
        hex,
    );
    out += emitNameMap(
        "modifiersByModifierName",
        loadYAML("NuPhy", "modifiers.yml"),
        hex,
    );
    writeFileSync(join(outDir, "keycodes.ts"), out);
    console.log("Wrote data/keycodes.ts");
}
