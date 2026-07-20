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
    HidChannels,
    NuPhyKeyboard,
    PermissionsError,
    USAGE_PAGE,
    UnsupportedKeyboardError,
    hidAccessFailureMessage,
    matchDescriptor,
} from "@nupsi/core";

function accessError(): PermissionsError {
    const platform = /Linux/.test(navigator.userAgent) ? "linux" : "web";
    return new PermissionsError(hidAccessFailureMessage(platform));
}

/** True if this HIDDevice entry is the NuPhy vendor-specific collection. */
export function isVendorCollection(device: HIDDevice): boolean {
    return device.collections.some((c) => c.usagePage === USAGE_PAGE);
}

async function openChannels(device: HIDDevice): Promise<HidChannels> {
    if (!device.opened) {
        try {
            await device.open();
        } catch {
            throw accessError();
        }
    }

    // Unlike hidapi, WebHID passes the report ID separately from the data,
    // and Chrome routes reports to the right collection by report ID; the
    // request and data channels are therefore the same device here.
    return {
        async sendRequestReport(report) {
            await device.sendFeatureReport(report[0]!, report.subarray(1));
        },
        async sendDataReport(report) {
            await device.sendFeatureReport(report[0]!, report.subarray(1));
        },
        async receiveDataReport(reportId) {
            // Chrome's returned DataView includes the report ID as byte 0,
            // matching the hidapi convention the core expects.
            const view = await device.receiveFeatureReport(reportId);
            return new Uint8Array(
                view.buffer,
                view.byteOffset,
                view.byteLength,
            );
        },
        async close() {
            await device.close();
        },
    };
}

/**
 * Wraps a WebHID device in a NuPhyKeyboard. Throws UnsupportedKeyboardError
 * for NuPhy-like devices that are not supported models.
 */
export function keyboardFromHidDevice(device: HIDDevice): NuPhyKeyboard {
    const descriptor = matchDescriptor(device.productName);
    if (descriptor === null) {
        throw new UnsupportedKeyboardError(
            `No supported keyboards found, but a similar keyboard, '${device.productName}', has been found.\n\nIf you believe this keyboard not being supported is an error, please file a bug report.`,
        );
    }
    return new NuPhyKeyboard(descriptor, {
        productString: device.productName,
        // WebHID does not expose bcdDevice, so the firmware version is
        // unavailable in the browser.
        firmwareVersion: 0,
        open: () => openChannels(device),
    });
}
