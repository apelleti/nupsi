# Hardware validation procedure

The TypeScript port is validated byte-for-byte against USB captures in
`../util/usb` (run `pnpm test`), but before trusting it with your keyboard —
and before releasing it as the default implementation — each board should go
through this checklist **once per board model** (Air75, Air60, Halo75).

Writing a keymap is the risky operation of a reverse-engineered protocol:
always start with a backup, and keep the C++ CLI available for
cross-checking and recovery.

## Prerequisites

- The keyboard plugged in **via USB** (not Bluetooth/2.4 GHz).
- Permissions set up (see README).
- Optional: a build of the original C++ CLI from
  [donn/nudelta](https://github.com/donn/nudelta) (`yarn build_native`), a
  handy independent cross-check and recovery tool.
- `pnpm build` run here. Below, `ndts` = `node packages/cli/dist/index.js`.

## CLI checklist

1. **Detection**: `ndts -f` prints the same model and firmware as the C++
   `nudelta -f`.
2. **Backup (with the C++ CLI)**: `nudelta -D backup_win.bin` and
   `nudelta -D backup_mac.bin -M`. Keep these files.
3. **Read parity**: `ndts -D ts_win.bin` then `cmp backup_win.bin ts_win.bin`
   — the dumps must be identical (same for `-M`).
4. **Write**: `ndts -l ../example.yml`, then check physically (capslock
   should act as Escape, in both Win and Mac switch positions).
5. **Read-back**: `nudelta -D after.bin` (C++) and confirm the diff against
   the backup matches the profile's remaps and nothing else.
6. **Reset**: `ndts -r`, check the keyboard behaves stock again.
7. **Restore**: `ndts -L backup_win.bin` and `ndts -L backup_mac.bin -M` if
   you had a custom keymap before testing.

## Web app checklist

Same flow through the UI, in Chrome and Edge, ideally on Linux + macOS +
Windows:

1. "Connect Keyboard" lists and adopts the board (udev rule needed on
   Linux).
2. The rendered layout matches the physical keyboard.
3. Remap capslock → esc, WRITE, verify physically, in both Win and Mac
   modes.
4. Open/Save round-trips `example.yml`.
5. After testing, reset from the CLI (`ndts -r`) and restore your backup.

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
| Air75 | 0110     | Linux | CLI, full checklist: detection; read of both modes (Mac dump byte-identical to the golden default); identity write + `cmp`; full `-l` profile write with both modes verified against the computed expectation; **physical check** (capslock→esc, lalt⇄lmeta active on the keyboard); restore + `cmp`. Web app: WebHID connect + rendering in Chrome. | 2026-07-19 |

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
  overwritten. Always `-D` a backup of both modes first.
- The physical Win/Mac side switch selects which keymap is active; a write
  to the inactive mode is stored but has no visible effect until the switch
  is flipped.
