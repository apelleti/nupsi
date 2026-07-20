#!/usr/bin/env node
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
    NuPhyKeyboard,
    parseKeymapWords,
    prettyPrintBinary,
    serializeKeymapWords,
} from "@nudelta/core";
import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { findKeyboard } from "./nodeHidTransport.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

async function getKeyboard(verify = true): Promise<NuPhyKeyboard> {
    const keyboard = await findKeyboard(verify);
    if (keyboard === null) {
        throw new Error(
            "Couldn't find a NuPhy keyboard connected to this device. Make sure it's plugged in via USB.",
        );
    }
    const firmware = keyboard.firmwareVersion.toString(16).padStart(4, "0");
    console.log(
        `Found NuPhy ${keyboard.name} at path ${keyboard.discovered.path} (Firmware ${firmware})`,
    );
    return keyboard;
}

function printVersion() {
    console.log(`Nudelta Utility v${version}`);
    console.log("Copyright (c) Mohamed Gaber 2022");
    console.log(`
Licensed under the GNU General Public License, version 3, or at your option,
any later version.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
`);
}

interface CliOptions {
    firmware?: boolean;
    loadProfile?: string;
    resetKeys?: boolean;
    mac?: boolean;
    verify: boolean;
    dumpKeys?: string;
    dumpHexTo?: string;
    loadKeys?: string;
    version?: boolean;
}

async function run(options: CliOptions): Promise<void> {
    const mode = options.mac ? "mac" : "win";

    if (options.version) {
        printVersion();
    } else if (options.firmware) {
        await getKeyboard();
    } else if (options.loadProfile !== undefined) {
        const keyboard = await getKeyboard();
        const yaml = readFileSync(options.loadProfile, "utf8");
        await keyboard.setKeymapFromYaml(yaml);
        console.log(`Wrote keymap '${options.loadProfile}' to the keyboard.`);
    } else if (options.resetKeys) {
        const keyboard = await getKeyboard();
        await keyboard.resetKeymap();
        console.log(
            "Wrote default keymap config to the keyboard's Windows and Mac modes.",
        );
    } else if (options.dumpKeys !== undefined) {
        const keyboard = await getKeyboard(options.verify);
        const keymap = await keyboard.getKeymap(mode);
        const bytes = serializeKeymapWords(keymap);
        writeFileSync(options.dumpKeys, bytes);
        console.log(
            `Wrote current ${mode === "mac" ? "Mac" : "Windows"} keymap to '${
                options.dumpKeys
            }'.`,
        );
        if (options.dumpHexTo !== undefined) {
            writeFileSync(options.dumpHexTo, prettyPrintBinary(bytes));
            console.log(
                `Wrote current keymap in hex format to '${options.dumpHexTo}'.`,
            );
        }
    } else if (options.loadKeys !== undefined) {
        const keyboard = await getKeyboard();
        const bytes = readFileSync(options.loadKeys);
        if (bytes.length === 0 || bytes.length % 4 !== 0) {
            throw new Error(
                `'${options.loadKeys}' does not look like a keymap dump: its size must be a positive multiple of 4 bytes.`,
            );
        }
        const keymap = parseKeymapWords(Uint8Array.from(bytes));
        await keyboard.setKeymap(keymap, mode);
        console.log(
            `Wrote keymap '${options.loadKeys}' to the keyboard's ${
                mode === "mac" ? "Mac" : "Windows"
            } mode.`,
        );
    } else {
        program.help();
    }
}

const program = new Command("nudelta")
    .description(
        "An open-source alternative to the NuPhy Console (Air75/Air60/Halo75 V1)",
    )
    .option("-V, --version", "Show the current version of this app and exit.")
    .option(
        "-f, --firmware",
        "Print the connected keyboard's firmware and exit.",
    )
    .option("-l, --load-profile <file>", "Load YAML keymap")
    .option("-r, --reset-keys", "Restore the original keymap.")
    .option(
        "-M, --mac",
        "Valid only if dump-keys or load-keys are passed: operate on the Mac mode of the keyboard instead of the Win mode.",
    )
    .option(
        "-N, --no-verify",
        "Valid only if dump-keys is passed: do not verify the keyboard's identity.",
    )
    .option("-D, --dump-keys <file>", "Dump the keymap to a binary file.")
    .option(
        "-H, --dump-hex-to <file>",
        "When the keymap is dumped to a binary file, also dump the keymap in a hex format to a text file.",
    )
    .option("-L, --load-keys <file>", "Load the keymap from a binary file.");

program.parse();

run(program.opts<CliOptions>()).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ERROR] ${message}\n`);
    process.exitCode = 1;
});
