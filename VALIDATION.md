# Hardware validation procedure

The TypeScript port is validated byte-for-byte against USB captures in
`../util/usb` (run `pnpm test`), but before trusting it with your keyboard —
and before releasing it as the default implementation — each board should go
through this checklist **once per board model** (Air75, Air60, Halo75).

Writing a keymap is the risky operation of a reverse-engineered protocol:
always start with a **Backup** (the app's Backup button) before writing.

> The original hardware validation was done with a command-line tool that has
> since been removed; the project ships only the web app now. The
> "Validated boards" record below reflects that historical run.

## Prerequisites

- The keyboard plugged in **via USB** (not Bluetooth/2.4 GHz).
- Permissions set up (see README — udev rule on Linux).
- A Chromium browser (Chrome, Edge, Brave). `pnpm --filter @nupsi/web dev`
  (or the built site).
- Optional: the original C++ CLI from
  [donn/nudelta](https://github.com/donn/nudelta) as an independent
  cross-check / recovery tool.

## Web app checklist

In Chrome and Edge, ideally on Linux + macOS + Windows:

1. **Connect Keyboard** lists and adopts the board (udev rule needed on
   Linux). The status pill shows the model.
2. **Backup** downloads the current keymap as a `.yml`. Keep it.
3. The rendered layout matches the physical keyboard, and existing on-device
   remaps show up as badges.
4. Remap capslock → esc, **Write** (review the diff), verify physically, in
   **both** Win and Mac side-switch positions.
5. **Open** the backup / `example.yml` round-trips.
6. **Lighting**: set a solid colour, Apply, confirm the LEDs change; try an
   effect.
7. Restore your backup via **Open** + **Write**.

## Known unknowns to confirm on hardware

- **WebHID report framing**: the transport assumes Chrome's
  `receiveFeatureReport` DataView includes the report ID as byte 0, and that
  Chrome routes report IDs 5/6 to the right collections (incl. the
  col05/col06 split on Windows). If dumps come back shifted by one byte,
  adjust `packages/web/src/webHidTransport.ts`.
- **Air60 quirks** (`keymap[167] = keymap[0]`, `keymap[94] = keymap[90]`)
  were ported from the C++ code but the Air60 has only a Mac golden dump —
  double-check Win mode on real hardware.

Once a board passes, note it (board, firmware, OS, browser) in this file.

## Validated boards

| Board | Firmware | OS    | What was validated                                                                                                                                                                                                                                                                                                                                   | Date       |
| ----- | -------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Air75 | 0110     | Linux | **Keymap**: detection; read of both modes (Mac dump byte-identical to the golden default); identity write + `cmp`; full profile write with both modes verified against the computed expectation; **physical check** (capslock→esc, lalt⇄lmeta active on the keyboard); restore + `cmp`. (Done with the since-removed CLI + a hardware capture harness.) | 2026-07-19 |
| Air75 | 0110     | Linux | **RGB lighting**: `setLighting` writes decoded from a USB capture of the official app; solid colour physically confirmed (green, red) and restored; effect id `config[144]` confirmed for Static and Reaction. Brightness and per-effect speed/direction not yet exposed.                                                                            | 2026-07-21 |
| Air75 | 0110     | Linux (Chrome) | **Web app**: WebHID connect, layout rendering, and the full flow above through the browser UI.                                                                                                                                                                                                                                    | 2026-07-19 |

## Firmware findings (Air75 fw 0110, discovered during validation)

- **A set-report silently fails if it closely follows another write.** The
  NuPhy Console always performs a request + get before each long set (W5-W7
  in `docs.md`); without that prime read, the second of two back-to-back
  mode writes is dropped (reads it back unchanged). `NuPhyKeyboard.setKeymap`
  now primes before every write and settles 150 ms after.
- **The firmware stalls feature reports while committing to flash** —
  `EPIPE` ("Broken pipe") on Linux hidraw when a report arrives during the
  commit window. The prime read retries up to 5 times with 150 ms backoff.
- **Keymap semantics reminder**: loading a `.yml` profile rebuilds _both_
  modes from the default keymap — any on-keyboard customization not present
  in the profile (e.g. an F-row set to F1-F12 from the official console) is
  overwritten. Always back up both modes first (the Backup button).
- The physical Win/Mac side switch selects which keymap is active; a write
  to the inactive mode is stored but has no visible effect until the switch
  is flipped.
