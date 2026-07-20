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
import {
    DATA_REPORT_ID,
    MAX_REPORT_SIZE,
    buildGetKeymapRequest,
    buildSetKeymapReport,
    parseKeymapReport,
} from "./protocol.js";
import { HidChannels, DiscoveredKeyboard } from "./transport.js";
import { buildKeymapsFromYaml, ValidateOptions } from "./yamlConfig.js";

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A supported NuPhy keyboard bound to a transport. Each operation opens the
 * device, performs its reports, and closes it again, mirroring the handle
 * lifecycle of the C++ implementation.
 */
export class NuPhyKeyboard {
    constructor(
        readonly descriptor: KeyboardDescriptor,
        readonly discovered: DiscoveredKeyboard,
    ) {}

    get name(): string {
        return this.descriptor.name;
    }

    get firmwareVersion(): number {
        return this.discovered.firmwareVersion;
    }

    private async withChannels<T>(
        fn: (channels: HidChannels) => Promise<T>,
    ): Promise<T> {
        const channels = await this.discovered.open();
        try {
            return await fn(channels);
        } finally {
            await channels.close();
        }
    }

    /**
     * Sends the keymap request for `mode`, retrying briefly: right after a
     * keymap write, the firmware stalls feature reports while it commits to
     * flash (EPIPE on Linux hidraw, observed on Air75 firmware 0110).
     */
    private async primeRead(
        channels: HidChannels,
        mode: KeyboardMode,
    ): Promise<Uint8Array> {
        const request = buildGetKeymapRequest(this.descriptor, mode);
        for (let attempt = 0; ; attempt += 1) {
            try {
                await channels.sendRequestReport(request);
                break;
            } catch (err) {
                if (attempt >= 4) {
                    throw err;
                }
                await delay(150);
            }
        }
        return channels.receiveDataReport(DATA_REPORT_ID, MAX_REPORT_SIZE);
    }

    async getKeymap(mode: KeyboardMode = "win"): Promise<number[]> {
        return this.withChannels(async (channels) => {
            const report = await this.primeRead(channels, mode);
            return parseKeymapReport(report);
        });
    }

    async setKeymap(
        keymap: readonly number[],
        mode: KeyboardMode = "win",
    ): Promise<void> {
        await this.withChannels(async (channels) => {
            // Read before writing, as in the NuPhy Console's captured
            // sequence (W5-W7 in util/usb/docs.md). Without it, the firmware
            // silently drops a set-report that closely follows another one
            // (observed on Air75 firmware 0110 when writing both modes).
            await this.primeRead(channels, mode);
            await channels.sendDataReport(
                buildSetKeymapReport(this.descriptor, mode, keymap),
            );
            // Let the firmware settle before the next report.
            await delay(150);
        });
    }

    async setKeymapFromYaml(
        yamlString: string,
        options: ValidateOptions = {},
    ): Promise<void> {
        const keymaps = buildKeymapsFromYaml(
            this.descriptor,
            yamlString,
            options,
        );
        // Mac first, then Windows, matching the C++ write order.
        await this.setKeymap(keymaps.mac, "mac");
        await this.setKeymap(keymaps.win, "win");
    }

    async resetKeymap(): Promise<void> {
        await this.setKeymap(this.descriptor.defaultKeymap.win, "win");
        await this.setKeymap(this.descriptor.defaultKeymap.mac, "mac");
    }
}
