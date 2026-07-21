# Nupsi

An open-source alternative to the NuPhy Console for the Air75 / Air60 /
Halo75 V1 keyboards — a static **web app** that remaps your keys (and controls
the RGB backlight) straight from the browser, no install and no server.

Nupsi is a port of [**nudelta**](https://github.com/donn/nudelta) by Mohamed
Gaber, which reverse-engineered the keyboards' USB protocol. It reuses the
same protocol, the same `res/` keyboard data, and the same `.yml` profiles,
dropping the C++ toolchain (CMake, cmake-js, Ruby, yaml-cpp) for a single
TypeScript codebase.

> **Repository:** https://github.com/apelleti/nupsi — the app runs in
> Chromium browsers (Chrome, Edge, Brave) via WebHID.

> **Status: keymap validated on Air75 (end-to-end incl. physical check),
> RGB colour/effect validated on Air75; experimental elsewhere.** The encoder
> is validated byte-for-byte against USB captures from the original nudelta
> C++ implementation (see `packages/core/test/` and `util/usb/`). Air60 and
> Halo75 still need on-hardware validation — see [VALIDATION.md](./VALIDATION.md).

## Layout

| Package       | What it is                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@nupsi/core` | Protocol encoding/decoding, keyboard descriptors (data-driven), YAML profile validation, RGB lighting. Pure logic, fully tested. |
| `@nupsi/web`  | Static web app using [WebHID](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API): no install, no server. Chromium-only. |

The keyboard data (default keymaps, key indices, keycodes) is generated from
the YAML files in `res/` — the single source of truth:

```sh
pnpm gen   # regenerate packages/core/src/data after editing res/
```

Adding a keyboard = adding its data: YAML files under `res/<Board>/`, a
descriptor entry in `packages/core/src/descriptors.ts`, and a layout in
`packages/web/src/keyboards.js`. No protocol code.

## Development

```sh
pnpm install
pnpm build     # @nupsi/core
pnpm test      # vitest, includes the golden byte-for-byte tests
pnpm lint      # prettier + tsc --noEmit

pnpm --filter @nupsi/web dev      # run the web app on localhost
pnpm --filter @nupsi/web build    # produce the static site in ./dist
```

The web app needs a Chromium-based browser (Chrome, Edge, Brave). On **Linux**
a udev rule is required so the browser can reach the keyboard over hidraw:

```sh
echo 'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", TAG+="uaccess"' | sudo tee /etc/udev/rules.d/70-nupsi.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

On macOS and Windows the browser handles the permission prompt itself.

## Credits & license

Nupsi is a derivative work of [nudelta](https://github.com/donn/nudelta)
(© Mohamed Gaber), released under the GNU General Public License v3.0 or
later — the same license, kept for the whole repository.

NuPhy® is a registered trademark of NuPhy Studio. Nupsi is unofficial and
not affiliated with NuPhy Studio.
