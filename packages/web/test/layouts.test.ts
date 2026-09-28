import { AIR75, KeyboardDescriptor, KeyboardMode } from "@nupsi/core";
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain JS module, no types
import keyboards from "../src/keyboards.js";

function encode(
    descriptor: KeyboardDescriptor,
    key: string,
    modifiers: string[],
): number {
    let word = descriptor.keycodesByKeyName[key]!;
    for (const modifier of modifiers) {
        word |= descriptor.modifiersByModifierName[modifier]!;
    }
    return word >>> 0;
}

// Air75 only: it is the board validated on hardware, and its factory keymap
// comes from real USB captures. Air60 and Halo75 still have known
// disagreements between their layouts and their data (see VALIDATION.md).
describe("Air75 layout matches its keymap data", () => {
    for (const mode of ["win", "mac"] as KeyboardMode[]) {
        it(`every remappable key (${mode}) has an index and the factory default`, () => {
            for (const row of keyboards.Air75.getLayout(mode)) {
                for (const key of row) {
                    if (!key.remappable) {
                        continue;
                    }
                    const entries: [string, string, string[]][] = [
                        [key.id, key.defaultMapping, key.defaultModifiers],
                    ];
                    if (key.altID) {
                        entries.push([
                            key.altID,
                            key.altDefaultMapping,
                            key.altDefaultModifiers,
                        ]);
                    }
                    for (const [id, mapping, modifiers] of entries) {
                        const index = AIR75.indicesByKeyName[mode][id];
                        expect(
                            index,
                            `${mode} ${id} has an index`,
                        ).toBeDefined();
                        expect(
                            encode(AIR75, mapping, modifiers),
                            `${mode} ${id} default`,
                        ).toBe(AIR75.defaultKeymap[mode][index!]! >>> 0);
                    }
                }
            }
        });
    }
});

describe("every board's layouts", () => {
    for (const kind of ["Air60", "Air75", "Halo75"]) {
        for (const mode of ["win", "mac"] as KeyboardMode[]) {
            it(`${kind} (${mode}): the bracket keys carry their own ids`, () => {
                const keys = keyboards[kind].getLayout(mode).flat();
                // The id decides which keymap slot a remap is written to, so
                // it must match what the keycap shows.
                expect(keys.find((k: any) => k.label === "[").id).toBe(
                    "lbracket",
                );
                expect(keys.find((k: any) => k.label === "]").id).toBe(
                    "rbracket",
                );
            });
        }

        it(`${kind}: Windows and Mac layouts line up key for key`, () => {
            // Copy to Mac / Windows pairs keys by (row, column).
            const win = keyboards[kind].getLayout("win");
            const mac = keyboards[kind].getLayout("mac");
            expect(mac.length).toBe(win.length);
            win.forEach((row: any[], r: number) => {
                expect(mac[r].length, `row ${r}`).toBe(row.length);
                row.forEach((key: any, c: number) => {
                    const other = mac[r][c];
                    expect(other.width, `${key.id}`).toBe(key.width);
                    expect(other.remappable, `${key.id}`).toBe(key.remappable);
                    expect(Boolean(other.altID), `${key.id}`).toBe(
                        Boolean(key.altID),
                    );
                });
            });
        });
    }
});
