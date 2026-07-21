# Nupsi

An open-source alternative to the NuPhy Console for the **Air75 / Air60 /
Halo75 V1** keyboards — a static **web app** that remaps your keys and
controls the RGB backlight straight from the browser. No install, no server:
it talks to the keyboard over [WebHID](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API).

Nupsi is a port of [**nudelta**](https://github.com/donn/nudelta) by Mohamed
Gaber, which reverse-engineered the keyboards' USB protocol. It reuses the
same protocol, the same `res/` keyboard data, and the same `.yml` profiles,
dropping the C++ toolchain (CMake, cmake-js, Ruby, yaml-cpp) for a single
TypeScript codebase. The RGB support was reverse-engineered separately from
the official NuPhy Console — see [`util/nuphy-console-notes.md`](./util/nuphy-console-notes.md).

> **Repository:** https://github.com/apelleti/nupsi
>
> **Browser:** Chromium only (Chrome, Edge, Brave) — WebHID isn't in Firefox
> or Safari. HTTPS or `localhost` required (WebHID needs a secure context).

> **Status:** keymap and RGB (colour + effect) validated on a real Air75,
> end-to-end including physical checks. Air60 and Halo75 are ported but not
> yet hardware-tested. The encoder is validated byte-for-byte against USB
> captures (`packages/core/test/`, `util/usb/`). See [VALIDATION.md](./VALIDATION.md).

## Features

- **Remap any key**, with independent **Windows** and **Mac** layouts (the
  keyboard's physical side switch selects which is live).
- **Reads the keyboard's actual state on connect** — existing remaps show up
  as badges, so what you see is what's on the device.
- **Confirm-diff before writing**: a clear list of exactly what will change
  (including resets to default) before anything is sent.
- **Keycode picker** with search and groups, plus a **press-a-key** capture.
- **Backup / Open / Save** `.yml` profiles (compatible with nudelta).
- **RGB backlight**: pick a solid colour and one of **20 hardware effects**
  (Static, Breathing, Rainbow Wheel, Reaction, Sine Wave, …); the colour
  picker hides itself for rainbow / multi-colour effects.

## Using the app

1. Open the site in **Chrome or Edge** (a deployed URL, or `pnpm dev` locally).
   On Linux, set up the udev rule first (see [Permissions](#permissions)).
2. Plug the keyboard in **via USB** and click **Connect keyboard**; pick it
   from the browser's device prompt.
3. Click a key, choose its new mapping (picker or the ⌨ capture button), then
   **Write** — review the diff and confirm. Flip the side switch to edit the
   other mode.
4. **Backup** downloads the current keymap; **Lighting** sets colour/effect.

## Deploying

The app is fully static, so any static host works. A [`vercel.json`](./vercel.json)
is included:

- **Install:** `pnpm install`
- **Build:** `pnpm --filter '@nupsi/web...' build` (builds `@nupsi/core`, then the app)
- **Output:** `packages/web/dist`

On Vercel, keep the project's **Root Directory at the repository root** (not
`packages/web`) so the whole workspace is available and `@nupsi/core` resolves.
For any other host, run the build and serve `packages/web/dist` over HTTPS.

## Development

```sh
pnpm install
pnpm build     # @nupsi/core
pnpm test      # vitest — includes the golden byte-for-byte tests
pnpm lint      # prettier --check + tsc --noEmit
pnpm format    # prettier --write

pnpm --filter @nupsi/web dev      # run the web app on localhost
pnpm --filter @nupsi/web build    # produce the static site in packages/web/dist
```

### Packages

| Package       | What it is                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@nupsi/core` | Protocol encoding/decoding, keyboard descriptors (data-driven), YAML profile validation, RGB lighting. Pure logic, fully tested. |
| `@nupsi/web`  | Static WebHID web app (Vite). Chromium-only.                                                                                      |

### Keyboard data

Default keymaps, key indices and keycodes are generated from the YAML files in
`res/` — the single source of truth:

```sh
pnpm gen   # regenerate packages/core/src/data after editing res/
```

Adding a keyboard = adding its data: YAML files under `res/<Board>/`, a
descriptor entry in `packages/core/src/descriptors.ts`, and a layout in
`packages/web/src/keyboards.js`. No protocol code.

## Permissions

- **Linux** — a udev rule lets the browser reach the keyboard over hidraw:

  ```sh
  echo 'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", TAG+="uaccess"' | sudo tee /etc/udev/rules.d/70-nupsi.rules
  sudo udevadm control --reload-rules && sudo udevadm trigger
  ```

  (replug the keyboard afterwards). If it still can't connect, the app shows
  this exact command.
- **macOS / Windows** — the browser handles the permission prompt itself.

## Credits & license

Nupsi is a derivative work of [nudelta](https://github.com/donn/nudelta)
(© Mohamed Gaber), released under the **GNU General Public License v3.0 or
later** — the same license, kept for the whole repository.

NuPhy® is a registered trademark of NuPhy Studio. Nupsi is unofficial and not
affiliated with NuPhy Studio.
