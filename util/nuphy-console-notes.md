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

## Still missing: the HID feature-report wire format

The config gives the *semantics* (effect ids, indices, ranges); the *wire
format* (report id + byte layout that packs effect/speed/brightness/color into
the `HidD_SetFeature` buffer) is built in native code. The reliable way to get
it is a **USB capture** of the official app performing one lighting change —
see the capture recipe in the chat / project notes. The keymap write already
uses report `0x06 0x04 …`; lighting is expected to be a sibling feature report.

Once captured, decode with `util/usb/parse_from_pcap.rb` and implement in
`@nupsi/core` behind golden tests, exactly like the keymap path.
