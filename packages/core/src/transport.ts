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
 * A pair of HID feature-report channels to one keyboard.
 *
 * All reports include the report ID as byte 0, matching the hidapi
 * convention used by the C++ implementation; transports that separate the
 * report ID (e.g. WebHID) must adapt.
 *
 * On Windows the request and data channels are distinct HID paths
 * ("col05"/"col06"); elsewhere they are the same device.
 */
export interface HidChannels {
    sendRequestReport(report: Uint8Array): Promise<void>;
    sendDataReport(report: Uint8Array): Promise<void>;
    /** Reads a feature report from the data channel. */
    receiveDataReport(reportId: number, maxLength: number): Promise<Uint8Array>;
    close(): Promise<void>;
}

/** Identity of a discovered keyboard, transport-independent. */
export interface DiscoveredKeyboard {
    productString: string;
    manufacturerString?: string;
    /** bcdDevice, i.e. the firmware version. */
    firmwareVersion: number;
    /** Primary HID path, when the transport has paths (informational). */
    path?: string;
    open(): Promise<HidChannels>;
}
