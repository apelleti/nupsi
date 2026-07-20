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
    KeyboardDescriptor,
    NuPhyKeyboard,
    PRODUCT_ID,
    PermissionsError,
    USAGE,
    USAGE_PAGE,
    UnsupportedKeyboardError,
    VENDOR_ID,
    hidAccessFailureMessage,
    matchDescriptor,
} from "@nupsi/core";
import { HIDAsync, devicesAsync, type Device } from "node-hid";

// On Windows, the keyboard exposes one HID path per "collection"; keymap
// data and requests go to different ones (cf. NuPhy::find in lib/nuphy.cpp).
const REQUEST_COL = "col05";
const DATA_COL = "col06";

function accessError(): PermissionsError {
    return new PermissionsError(hidAccessFailureMessage(process.platform));
}

function isNuPhyInterface(device: Device): boolean {
    return (
        device.vendorId === VENDOR_ID &&
        device.productId === PRODUCT_ID &&
        device.interface !== -1 &&
        device.usage === USAGE &&
        device.usagePage === USAGE_PAGE
    );
}

async function openChannels(
    dataPath: string,
    requestPath: string,
): Promise<HidChannels> {
    let data: HIDAsync;
    try {
        data = await HIDAsync.open(dataPath);
    } catch {
        throw accessError();
    }
    let request = data;
    if (requestPath !== dataPath) {
        try {
            request = await HIDAsync.open(requestPath);
        } catch {
            // Close the data handle, but don't let a close rejection shadow
            // the permissions error we mean to throw.
            await data.close().catch(() => {});
            throw accessError();
        }
    }

    return {
        async sendRequestReport(report) {
            await request.sendFeatureReport(Buffer.from(report));
        },
        async sendDataReport(report) {
            await data.sendFeatureReport(Buffer.from(report));
        },
        async receiveDataReport(reportId, maxLength) {
            const read = await data.getFeatureReport(reportId, maxLength);
            return Uint8Array.from(read);
        },
        async close() {
            // Always close the data handle even if the request handle's close
            // rejects — otherwise an open HIDAsync handle keeps the process
            // alive and the CLI hangs on exit (Windows two-handle case).
            try {
                if (request !== data) {
                    await request.close();
                }
            } finally {
                await data.close();
            }
        },
    };
}

interface Candidate {
    productString: string;
    manufacturerString?: string;
    firmwareVersion: number;
    dataPath: string;
    requestPath: string;
}

function findCandidateWindows(devices: Device[]): Candidate | null {
    let productName: string | undefined;
    let manufacturerString: string | undefined;
    let firmware = 0;
    let dataPath: string | undefined;
    let requestPath: string | undefined;

    for (const device of devices) {
        if (!isNuPhyInterface(device) || device.path === undefined) {
            continue;
        }
        if (productName !== undefined && device.product !== productName) {
            continue;
        }
        const path = device.path.toLowerCase();
        if (path.includes(REQUEST_COL)) {
            if (requestPath !== undefined) {
                throw new Error(
                    "Multiple keyboards with the same product ID found! Please ensure only one keyboard is plugged in.\n",
                );
            }
            productName = device.product;
            requestPath = device.path;
            firmware = device.release;
            manufacturerString = device.manufacturer;
        } else if (path.includes(DATA_COL)) {
            if (dataPath !== undefined) {
                throw new Error(
                    "Multiple keyboards with the same product ID found! Please ensure only one keyboard is plugged in.\n",
                );
            }
            productName = device.product;
            dataPath = device.path;
        }
    }

    if (
        dataPath === undefined ||
        requestPath === undefined ||
        productName === undefined
    ) {
        return null;
    }
    return {
        productString: productName,
        manufacturerString,
        firmwareVersion: firmware,
        dataPath,
        requestPath,
    };
}

function keyboardFromDevice(
    device: Device,
    descriptor: KeyboardDescriptor,
): NuPhyKeyboard {
    const path = device.path as string;
    return new NuPhyKeyboard(descriptor, {
        productString: device.product ?? "",
        manufacturerString: device.manufacturer,
        firmwareVersion: device.release,
        path,
        open: () => openChannels(path, path),
    });
}

/**
 * Non-Windows discovery. Like NuPhy::find in the C++ implementation, this
 * keeps scanning past unsupported models and selects the first *supported*
 * keyboard, rather than locking onto the first device that merely matches the
 * vendor interface.
 */
function selectSinglePath(
    devices: Device[],
    verify: boolean,
): NuPhyKeyboard | null {
    let chosen: { device: Device; descriptor: KeyboardDescriptor } | null =
        null;
    let multipleWarned = false;
    let unsupportedName: string | null = null;

    for (const device of devices) {
        if (!isNuPhyInterface(device) || device.path === undefined) {
            continue;
        }
        if (device.product === undefined) {
            // Enumerable but not readable: a permissions problem — but a
            // usable keyboard already chosen wins over another device we
            // simply can't read.
            if (chosen !== null) {
                continue;
            }
            throw accessError();
        }
        const descriptor = matchDescriptor(device.product, verify);
        if (descriptor === null) {
            unsupportedName = device.manufacturer
                ? `${device.manufacturer} ${device.product}`
                : device.product;
            continue;
        }
        if (chosen === null) {
            chosen = { device, descriptor };
        } else if (chosen.device.path !== device.path && !multipleWarned) {
            // A different physical keyboard also matched (same path is just
            // another collection of the same device).
            process.stderr.write(
                "[Warning] Multiple NuPhy keyboards found! Please keep only one plugged in. Only the first matched device will be used.\n",
            );
            multipleWarned = true;
        }
    }

    if (chosen === null) {
        if (unsupportedName !== null) {
            throw new UnsupportedKeyboardError(
                `No supported keyboards found, but a similar keyboard, '${unsupportedName}', has been found.\n\nIf you believe this keyboard not being supported is an error, please file a bug report.`,
            );
        }
        return null;
    }
    return keyboardFromDevice(chosen.device, chosen.descriptor);
}

/**
 * Finds the connected NuPhy keyboard, mirroring NuPhy::find in the C++
 * implementation. Returns null when nothing NuPhy-like is plugged in.
 */
export async function findKeyboard(
    verify = true,
): Promise<NuPhyKeyboard | null> {
    const devices = await devicesAsync(VENDOR_ID, PRODUCT_ID);

    if (process.platform !== "win32") {
        return selectSinglePath(devices, verify);
    }

    // Windows: the request and data channels are distinct HID paths, so a
    // single keyboard is assembled from two collections first.
    const candidate = findCandidateWindows(devices);
    if (candidate === null) {
        return null;
    }
    const descriptor = matchDescriptor(candidate.productString, verify);
    if (descriptor === null) {
        const displayName = candidate.manufacturerString
            ? `${candidate.manufacturerString} ${candidate.productString}`
            : candidate.productString;
        throw new UnsupportedKeyboardError(
            `No supported keyboards found, but a similar keyboard, '${displayName}', has been found.\n\nIf you believe this keyboard not being supported is an error, please file a bug report.`,
        );
    }
    return new NuPhyKeyboard(descriptor, {
        productString: candidate.productString,
        manufacturerString: candidate.manufacturerString,
        firmwareVersion: candidate.firmwareVersion,
        path: candidate.dataPath,
        open: () => openChannels(candidate.dataPath, candidate.requestPath),
    });
}
