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
import { ProtocolError } from "./errors.js";

/** Matches MAX_READABLE_SIZE in the C++ implementation. */
export const MAX_REPORT_SIZE = 0x7ff;

/** Report ID of the data channel ("get" responses and keymap writes). */
export const DATA_REPORT_ID = 0x06;

/** Byte length of the header that prefixes a keymap "get" response. */
const GET_RESPONSE_HEADER_SIZE = 8;

/** Serializes keymap words to bytes, explicitly little-endian. */
export function serializeKeymapWords(words: readonly number[]): Uint8Array {
    const out = new Uint8Array(words.length * 4);
    const view = new DataView(out.buffer);
    words.forEach((word, i) => view.setUint32(i * 4, word >>> 0, true));
    return out;
}

/** Parses little-endian bytes into keymap words. Trailing bytes that do not
 *  form a whole word are ignored, as in the C++ implementation. */
export function parseKeymapWords(bytes: Uint8Array): number[] {
    const count = Math.floor(bytes.length / 4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const words = new Array<number>(count);
    for (let i = 0; i < count; i += 1) {
        words[i] = view.getUint32(i * 4, true) >>> 0;
    }
    return words;
}

/** The feature report requesting a keymap dump (sent on the request channel). */
export function buildGetKeymapRequest(
    descriptor: KeyboardDescriptor,
    mode: KeyboardMode,
): Uint8Array {
    return Uint8Array.from(descriptor.getKeymapHeader[mode]);
}

/** Extracts keymap words from a keymap "get" response (including report ID). */
export function parseKeymapReport(report: Uint8Array): number[] {
    if (report.length < GET_RESPONSE_HEADER_SIZE) {
        throw new ProtocolError(
            `Keymap response too short: got ${report.length} bytes, expected at least ${GET_RESPONSE_HEADER_SIZE}.`,
        );
    }
    return parseKeymapWords(report.subarray(GET_RESPONSE_HEADER_SIZE));
}

/** Applies board-specific index aliases; returns a copy. */
export function finalizeKeymap(
    descriptor: KeyboardDescriptor,
    keymap: readonly number[],
): number[] {
    const copy = [...keymap];
    for (const { to, from } of descriptor.keymapAliases) {
        if (to >= copy.length || from >= copy.length) {
            throw new ProtocolError(
                `Keymap too short for ${descriptor.name}: alias ${from} -> ${to} is out of bounds (length ${copy.length}).`,
            );
        }
        copy[to] = copy[from]!;
    }
    return copy;
}

/** The full feature report (report ID included) that writes a keymap. */
export function buildSetKeymapReport(
    descriptor: KeyboardDescriptor,
    mode: KeyboardMode,
    keymap: readonly number[],
): Uint8Array {
    const header = descriptor.setKeymapHeader[mode];
    const payload = serializeKeymapWords(finalizeKeymap(descriptor, keymap));
    const out = new Uint8Array(header.length + payload.length);
    out.set(header, 0);
    out.set(payload, header.length);
    return out;
}
