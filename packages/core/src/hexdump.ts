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

/**
 * Formats bytes in the same layout as the C++ prettyPrintBinary: an offset
 * column and one 4-byte word per line. This is the format of the annotated
 * dumps in util/usb/.
 */
export function prettyPrintBinary(bytes: Uint8Array): string {
    let out = "";
    bytes.forEach((byte, offset) => {
        if (offset % 4 === 0) {
            out += `${offset.toString(16).padStart(4, "0")}  `;
        }
        out += `${byte.toString(16).padStart(2, "0")} `;
        if (offset % 4 === 3) {
            out += "\n";
        }
    });
    return out;
}

/** Parses the hex dump format back into bytes, ignoring `-> key` annotations. */
export function parseAnnotatedHex(text: string): Uint8Array {
    const bytes: number[] = [];
    for (const line of text.split("\n")) {
        const match = line.match(/^[0-9a-f]{4}((?:\s+[0-9a-f]{2}){1,4})\s*/);
        if (match === null) {
            continue;
        }
        for (const byte of match[1]!.trim().split(/\s+/)) {
            bytes.push(parseInt(byte, 16));
        }
    }
    return Uint8Array.from(bytes);
}
