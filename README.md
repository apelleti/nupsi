# Nuphy Console (TypeScript)

An open-source alternative to the NuPhy Console for the Air75 / Air60 /
Halo75 V1 keyboards — a TypeScript rewrite of
[donn/nudelta](https://github.com/donn/nudelta): same protocol, same `res/`
data, same `.yml` profiles, without the C++ toolchain (CMake, cmake-js,
Ruby, yaml-cpp).

> **Status: validated on Air75 (CLI, end-to-end incl. physical check);
> experimental elsewhere.** The encoder is validated byte-for-byte against
> USB captures from the original C++ implementation (see
> `packages/core/test/` and `util/usb/`). Air60 and Halo75 still need
> on-hardware validation, and the web app needs a write test — see
> [VALIDATION.md](./VALIDATION.md).

## Layout

| Package         | What it is                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@nudelta/core` | Protocol encoding/decoding, keyboard descriptors (data-driven), YAML profile validation. Pure logic, no I/O, fully tested.        |
| `@nudelta/cli`  | `nudelta` command-line tool, drop-in equivalent of the C++ CLI, using [node-hid](https://github.com/node-hid/node-hid).           |
| `@nudelta/web`  | Static web app using [WebHID](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API): no install, no server. Chromium-only. |

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
pnpm --filter @nudelta/web dev    # web app on localhost (WebHID needs Chrome/Edge)
```

## Permissions

Same as the C++ version:

- **Linux**: a udev rule is required —
  `echo 'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", TAG+="uaccess"' | sudo tee /etc/udev/rules.d/70-nudelta.rules && sudo udevadm control --reload-rules && sudo udevadm trigger`
- **macOS**: grant Input Monitoring to your terminal (CLI). The web app goes
  through Chrome's own permission prompt.
- **Windows**: none.

## License

GPL-3.0-or-later, same as the rest of the repository.
