# NuPhy Console reverse-engineering notes (lighting / macros / profiles)

Findings from the official **NuPhy Console V1.0.3** installer (Inno Setup),
gathered to add the features nupsi lacks (RGB, macros, profiles). No code was
copied — these are interoperability facts (effect ids, indices, byte layouts).

## What the app is

- Native **MFC** app `OemDrv.exe` (a rebranded OEM keyboard tool, internal
  codename `BY916`), **not** Electron — so there is no JS to extract.
- Talks to the keyboard via Windows HID (`HidD_SetFeature` / `HidD_GetFeature`).
- Config lives in `Cfg.ini`; UI strings in `text.xml`; skins in `skins/*.png`.
- Confirms the device: **VID `0x05AC`, PID `0x024F`** (same family as the
  keymap protocol nupsi already speaks).

## Lighting — recovered from Cfg.ini

`Cfg.ini` lists the hardware lighting effects as
`LedOptN = slot, effect_id, hasSpeed, hasBrightness, hasDirection, hasRandom, hasColor`:

| slot | effect_id | speed | brightness | direction | random | color |
| ---- | --------- | ----- | ---------- | --------- | ------ | ----- |
| 1    | 1         | -     | ✓          | -         | ✓      | ✓     |
| 2    | 3         | ✓     | ✓          | -         | ✓      | ✓     |
| 3    | 2         | ✓     | ✓          | -         | -      | -     |
| 4    | 19        | ✓     | ✓          | -         | ✓      | ✓     |
| 5    | 15        | ✓     | ✓          | -         | ✓      | ✓     |
| …    | …         |       |            |           |        |       |
| 20   | 26        | ✓     | ✓          | -         | ✓      | ✓     |
| 21   | 0 (off)   | -     | -          | -         | -      | -     |

(Full table in `Cfg.ini` under `LedOpt1..22`. `effect_id` is the value sent to
the keyboard; the UI "Reaction" effect in the screenshot is one of these.)

Other lighting facts:

- Channel order: `RGBIndex = 0,1,2` (RGB) normally, `GameRGBIndex = 2,1,0`
  (BGR) in game mode.
- Ranges: `SpeedNum = BriNum = 0x040005` → 5 steps, max index 4.
- `LedMask = 0xe2310`, `DefLed = 1,3,4,2,1`, default effect slot `DefLedIndex = 11`.
- A default per-effect parameter template: `LEDParam = 04,44,07,44,01,44,...`.

## Per-key LED ↔ keymap index map — recovered from Cfg.ini `[KBKEY]`

Each physical key is described as
`Kn = x1,y1,x2,y2, 0x02, <win-scancode>, 0x00, <led-index>, <keymap-index>`.
This gives the RGB per-key addressing **and** cross-references our `res/`
keymap indices. Examples (this file is the 60% / Air60-class `BY916`):

| key | win VK | led index | keymap index |
| --- | ------ | --------- | ------------ |
| Esc | 0x1B   | 0         | 0            |
| F1  | 0x70   | 6         | 1            |
| F2  | 0x71   | 12        | 2            |
| `   | 0xC0   | 1         | 21           |
| Tab | 0x09   | 2         | 42           |

(LED index steps by 6 across the top row — the exact byte stride in the RGB
buffer is one of the things a capture will pin down.)

## Macros / profiles

- `MacProtocol = 2`, `MacroHasMsKey = 0x07`, `MacroDir = 1` — macro protocol
  version 2 (more involved: storage, timing, mouse keys). Deferred.
- The app exposes Profile1/2/3; how they map to on-keyboard storage is TBD.

## Lighting wire format — recovered by USB capture (usbmon, full data)

Captured the official app under Wine changing solid colors while the physical
LEDs changed. Each "Apply" sends this sequence of **control SET_REPORT
(bmRequestType 0x21, bRequest 0x09) feature writes to interface 1**:

1. `05 83 b6 00 00 00`  — handshake (feature report id 0x05; same as keymap path)
2. `05 88 b8 00 00 00`  — handshake
3. `06 08 b8 00 40 00 00 00 …`  — **colour frame** (feature report id 0x06, 1032 bytes)
4. `06 03 b6 00 …`      — config (feature report id 0x06, 1032 bytes)

**The RGB colour is a plain R,G,B triplet at byte offset 533 of the `08 b8`
frame** (diffing solid red/green/blue changed only those 3 bytes):

| colour | frame[533..535] |
| ------ | --------------- |
| red    | `ff 00 00`      |
| green  | `00 ff 00`      |
| blue   | `00 00 ff`      |

The rest of the 1032-byte frame is fixed for a given effect, so "set solid
colour" = replay a captured frame with bytes 533-535 patched. The `03 b6`
config also changes at bytes ~144 and ~162 (brightness / effect id,
respectively — not yet isolated cleanly; the app's periodic re-sends add
noise). No interrupt/bulk OUT transfers are involved — everything is control
feature reports, exactly like the keymap.

Reference frame/config byte templates live in the capture at
`/tmp/nuphy-full.txt` (not committed).

**Effect id is byte 144 of the `03 b6` config.** Confirmed by capture:
Static = `0x01`, Reaction = `0x0c` (12). The effect **names** come from the
official app's own strings — `<tc_kb_led<id>>` in each `text.xml` (Japanese
only in this installer), where the tag index equals the effect id (led1 =
Static = id 1, led12 = Reaction = id 12, matching the captures). Translated:

| id | name           | id | name            |
| -- | -------------- | -- | --------------- |
| 1  | Static         | 11 | Neon Stream     |
| 2  | Breathing      | 12 | Reaction        |
| 3  | Rainbow Wheel  | 13 | Sine Wave       |
| 4  | Flash Away     | 14 | Scan            |
| 5  | Raindrops      | 15 | Rotary Windmill |
| 6  | Rainbow Roulette | 16 | Colorful Fall |
| 7  | Ripple Shining | 17 | Blossom         |
| 8  | Twinkling Stars | 18 | Rotating Storm |
| 9  | Shadow Disappear | 19 | Collision     |
| 10 | Retro Snake    | 20 | Perfect         |

(id 0 = Off, best guess; the app also lists Game Mode. The `LedOptN` table in
Cfg.ini gives each effect's UI slot order and capability flags — which have a
speed/direction/colour control.)

Confirmed there are **no vendor control requests and no interrupt/bulk OUT**
to the keyboard — a full-capture pass (all control transfer types) showed the
keyboard only ever receives SET_REPORT feature writes; the other control
traffic seen was USB hub/other-device housekeeping.

## Still to isolate

- **Brightness**: not reliably reproduced in the capture (config byte 162
  wiggles but looks like a sequence/toggle bit; min/max produced no stable
  distinct byte — possibly a Wine limitation on that specific control).
- Speed (for animated effects), and per-key custom colours vs the single
  global colour at frame[533].

## Original missing piece (now largely found for basic RGB)

The config gives the *semantics* (effect ids, indices, ranges); the *wire
format* (report id + byte layout that packs effect/speed/brightness/color into
the `HidD_SetFeature` buffer) is built in native code. The reliable way to get
it is a **USB capture** of the official app performing one lighting change —
see the capture recipe in the chat / project notes. The keymap write already
uses report `0x06 0x04 …`; lighting is expected to be a sibling feature report.

Once captured, decode with `util/usb/parse_from_pcap.rb` and implement in
`@nupsi/core` behind golden tests, exactly like the keymap path.
