import { describe, expect, it } from "vitest";
import {
    AIR75,
    DATA_REPORT_ID,
    HidChannels,
    NuPhyKeyboard,
    PartialWriteError,
} from "../src/index";

/** A fake keyboard whose data-channel writes fail from the `failAt`-th on. */
function fakeKeyboard(failAt: number): {
    keyboard: NuPhyKeyboard;
    writes: number[];
} {
    const writes: number[] = [];
    const channels: HidChannels = {
        async sendRequestReport() {},
        async sendDataReport(report) {
            writes.push(report.length);
            if (writes.length >= failAt) {
                throw new Error("Broken pipe");
            }
        },
        async receiveDataReport() {
            return new Uint8Array(16).fill(DATA_REPORT_ID, 0, 1);
        },
        async close() {},
    };
    const keyboard = new NuPhyKeyboard(AIR75, {
        productString: AIR75.productString,
        open: async () => channels,
    });
    return { keyboard, writes };
}

describe("two-mode writes", () => {
    it("report a partial write when the second mode fails", async () => {
        const { keyboard } = fakeKeyboard(2);
        const error = await keyboard.resetKeymap().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PartialWriteError);
        expect(error).toMatchObject({ written: "win", failed: "mac" });
        expect((error as Error).message).toMatch(/mixed state/);
        expect((error as Error).cause).toBeInstanceOf(Error);
    });

    it("rethrow a first-mode failure as is (nothing written)", async () => {
        const { keyboard } = fakeKeyboard(1);
        const error = await keyboard.resetKeymap().catch((e: unknown) => e);
        expect(error).not.toBeInstanceOf(PartialWriteError);
        expect((error as Error).message).toBe("Broken pipe");
    });

    it("write both modes when nothing fails", async () => {
        const { keyboard, writes } = fakeKeyboard(Infinity);
        await keyboard.resetKeymap();
        expect(writes).toHaveLength(2);
    });
});
