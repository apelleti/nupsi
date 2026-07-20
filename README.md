# Nupsi

An open-source alternative to the NuPhy Console for the Air75 / Air60 /
Halo75 V1 keyboards. Remap your keys from a **CLI** or a static **web app**
(no install, no server) — a TypeScript port with no C++ toolchain.

Nupsi is a port of [**nudelta**](https://github.com/donn/nudelta) by Mohamed
Gaber, which reverse-engineered the keyboards' USB protocol. It reuses the
same protocol, the same `res/` keyboard data, and the same `.yml` profiles,
dropping the C++ toolchain (CMake, cmake-js, Ruby, yaml-cpp) for a single
TypeScript codebase.

> **Web app:** https://apelleti.github.io/nyphy-console/ (Chromium browsers)

> **Status: validated on Air75 (CLI, end-to-end incl. physical check);
> experimental elsewhere.** The encoder is validated byte-for-byte against
> USB captures from the original nudelta C++ implementation (see
> `packages/core/test/` and `util/usb/`). Air60 and Halo75 still need
> on-hardware validation, and the web app needs a write test — see
> [VALIDATION.md](./VALIDATION.md).

## Layout

| Package       | What it is                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@nupsi/core` | Protocol encoding/decoding, keyboard descriptors (data-driven), YAML profile validation. Pure logic, no I/O, fully tested.        |
| `@nupsi/cli`  | `nupsi` command-line tool, a drop-in equivalent of the nudelta CLI, using [node-hid](https://github.com/node-hid/node-hid).       |
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
pnpm build     # core + cli
pnpm test      # vitest, includes the golden byte-for-byte tests
pnpm lint      # prettier + tsc --noEmit

node packages/cli/dist/index.js --help
pnpm --filter @nupsi/web dev    # web app on localhost (WebHID needs Chrome/Edge)
```

## Permissions

Same as nudelta:

- **Linux**: a udev rule is required —
  `echo 'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", TAG+="uaccess"' | sudo tee /etc/udev/rules.d/70-nupsi.rules && sudo udevadm control --reload-rules && sudo udevadm trigger`
- **macOS**: grant Input Monitoring to your terminal (CLI). The web app goes
  through Chrome's own permission prompt.
- **Windows**: none.

## Credits & license

Nupsi is a derivative work of [nudelta](https://github.com/donn/nudelta)
(© Mohamed Gaber), released under the GNU General Public License v3.0 or
later — the same license, kept for the whole repository.

NuPhy® is a registered trademark of NuPhy Studio. Nupsi is unofficial and
not affiliated with NuPhy Studio.
