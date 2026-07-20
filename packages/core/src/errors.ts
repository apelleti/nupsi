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

/** The user lacks OS-level permission to open the HID device. */
export class PermissionsError extends Error {
    override name = "PermissionsError";
}

/** A NuPhy-like device was found, but it is not a supported model. */
export class UnsupportedKeyboardError extends Error {
    override name = "UnsupportedKeyboardError";
}

/** The .yml profile failed validation. */
export class ConfigError extends Error {
    override name = "ConfigError";
}

/** Communication with the keyboard failed mid-operation. */
export class ProtocolError extends Error {
    override name = "ProtocolError";
}

export function hidAccessFailureMessage(
    platform: "darwin" | "linux" | "win32" | string,
): string {
    switch (platform) {
        case "darwin":
            return "Failed to read or write to your keyboard- please grant Nupsi Input Monitoring permissions in your System Preferences then restart Nupsi.";
        case "linux":
            return (
                "Failed to read or write to your keyboard- try running these commands then restarting your computer: \n\n" +
                'echo \'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", TAG+="uaccess"\' | sudo tee /etc/udev/rules.d/70-nupsi.rules && ' +
                "sudo udevadm control --reload-rules && sudo udevadm trigger"
            );
        case "web":
            return "Couldn't access the keyboard. Close any other app (or browser tab) using it, then reconnect. On Linux, a udev rule may be required.";
        default:
            return "Unable to read HID devices. Consider running Nupsi as a superuser or checking your operating system's HID access permissions.";
    }
}
