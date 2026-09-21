# Copilot Instructions — vscode-zms

This repository is a VS Code extension for **Sharp X68000 Z-MUSIC v2.08 MML
(`.zms`)** files. When generating or modifying `.zms` content, follow the
Z-MUSIC v2 grammar below. When touching extension source (`src/**`,
`media/**`, `test/**`), TypeScript is standard; the notes here apply to
MML content only.

Primary references (authoritative — prefer them over your training data):
- [docs/reference/zm04.txt](../docs/reference/zm04.txt) — common commands, voice definition, ADPCM config
- [docs/reference/zm05.txt](../docs/reference/zm05.txt) — MML letter commands (`v u o q p t k @ …`) with ranges
- [docs/reference/zm10.txt](../docs/reference/zm10.txt) — assembler-level function calls
- [docs/reference/zm11.txt](../docs/reference/zm11.txt) — compile-error message format
- [docs/reference/zm12.txt](../docs/reference/zm12.txt) — ZMD opcodes ($EA/$EC variable-length)

## Z-MUSIC v2 MML — hard rules

**Comments** start with `/` and run to end of line. Full-line comments use
`/` in column 1.

**Required init sequence** (a `.zms` will not produce sound without all
four):
```
(I)                     / driver init
(m1,3000)               / allocate 3000-byte buffer for track 1
(a1,1)                  / assign FM ch1 to track 1
(t1) @1 v14 o5 l4 c d e / MML with voice reference
```

**Paren-prefix commands** are the way tracks and drivers are addressed —
they are NOT letter MML commands. Never confuse them:
| Form | Meaning |
|---|---|
| `(I)` | initialize driver |
| `(m n,size)` | allocate track buffer |
| `(a n,ch)` | assign channel to track |
| `(t n1,n2,…)` | prefix following MML to tracks n1,n2,… |
| `(P)` / `(S)` | play / stop |
| `(V n,0,…)` | **define** FM voice n (55 parameters, see below) |
| `(@n,…)` | define FM voice n in AL/FB-separated form (55 params) |

**Letter MML commands** appear inside tracks only, after a `(t…)` prefix
or bare. The most common with ranges (zm05):

| Cmd | Range | Meaning |
|---|---|---|
| `v n` | 0–16 | FM volume (coarse) |
| `@v n` | 0–127 | absolute volume |
| `u n` | 0–127 | velocity |
| `o n` | -1–9 | octave |
| `q n` | 1–8 | relative gate n/8 |
| `p n` | 0–3 | pan (0=off, 1=R, 2=L, 3=both) |
| `t n` | 20–300 | tempo BPM |
| `k n` | -128–127 | semitone transpose |
| `@n` | 1–200 | select FM voice n (**reference**, not definition) |

**Octave notation is INVERTED** compared to typical MML (zm05 L201):
- `<` = octave **UP** (+1)
- `>` = octave **DOWN** (-1)

## Voice (音色) definition — the thing most likely to be hallucinated

`@1` alone in MML is a **reference** to voice number 1 (using ZMUSIC.X's
built-in default piano). It is NOT a definition. To define your own voice,
use one of these exact forms.

**The two forms are INCOMPATIBLE — never mix them**. The most common
Copilot failure is emitting `(@n,0,…)` (Form 2 opener + Form 1's leading
`0` + Form 1's parameter order). This results in 56 parameters instead of
55, the whole envelope shifts by one, OP1 gets AR=0 (silent), and if the
compiler is lenient the common line ends up with PAN=0 → total mute.
Choose one form and stick with it end-to-end:
- Form 1: opener is `(V`, `,0` after voice number IS REQUIRED (it's a mode
  discriminator, not a data byte), operators come AFTER the common line.
- Form 2: opener is `(@`, `,0` after voice number is FORBIDDEN, operators
  come BEFORE the common line.

**Form 1 — combined `(V n,0,…)`** ([zm04.txt:290-304](../docs/reference/zm04.txt#L290-L304)):
```
(V1,0
/        AF  OM  WF  SY  SP PMD AMD PMS AMS PAN  (11 common params, incl. AL/FB combined)
	 60, 15,  2,  0,210, 40,  0,  2,  0,  3,  0
/        AR  DR  SR  RR  SL  OL  KS  ML DT1 DT2 AME  (11 params × 4 operators)
	 31,  5,  0, 12,  2, 30,  1,  2,  7,  0,  0
	 31,  5,  0, 12,  8,  6,  1,  2,  5,  0,  0
	 31,  5,  0, 12,  8, 28,  1,  2,  3,  0,  0
	 31,  5,  0, 12,  8,  6,  1,  2,  5,  0,  0)
```
Total 55 parameters. `n` is voice number 1–200.

**Form 2 — AL/FB-separated `(@n,…)`** ([zm04.txt:308-321](../docs/reference/zm04.txt#L308-L321)):
```
(@1,           31,  0,  2,  0,  0, 21,  0,  1,  0,  0,  0    / op1: AR DR SR RR SL OL KS ML DT1 DT2 AME
	       31,  0,  0,  8,  0,  3,  0,  3,  0,  0,  0    / op2
	       31,  0,  0,  8,  0,  3,  0,  1,  0,  0,  0    / op3
	       31,  0,  0,  8,  0,  3,  0,  1,  0,  0,  0    / op4
/        AL  FB  OM PAN  WF  SY  SP PMD AMD PMS AMS
	  5,  7, 15,  3,  0,  0,  0,  0,  0,  0,  0)
```
Note the parenthesis-prefix `(@` distinguishes definition from `@n`
reference. AL and FB are separate parameters here (vs combined in Form 1).

**Common wrong forms Copilot tends to invent — do not emit any of these,
regardless of separator or brace style**:
- ✗ `@1 = ( … )` or `@1 = { … }` or `@1 = [ … ]` — Z-MUSIC has NO
  assignment operator. Voice definition ALWAYS starts with an opening
  paren immediately followed by `V` or `@`: `(V1,0,…)` or `(@1,…)`.
- ✗ `@1(…)` — same, `@n` is a reference; only `(V…)` / `(@…)` define.
- ✗ `voice 1 = ...` / `instrument 1 { ... }` (other tracker dialects)
- ✗ `(V1) 60 15 2 ...` without commas (Z-MUSIC requires comma separators)
- ✗ `(V1,60,15,...)` with fewer than 55 parameters (must be exactly 55;
  a 32-parameter definition is malformed and rejected by the compiler)
- ✗ All-zero parameter blocks — envelopes with AR=0 never key on and
  produce no audible sound. Use the canonical template below as the
  baseline and edit from there.
- ✗ Single-line 55-comma-separated blob. **Always break at every operator**
  so the file matches the zm04 layout — one common line, then one line
  per operator (4 lines), commented with the parameter names above each
  block. This is the house style and is used by every human-authored
  `.zms` in the ecosystem.

## Canonical minimum voice — copy this when asked for a "sine" / "init" / "default" voice

Pure sine (algorithm 7 = all four operators parallel; OP1 audible at
OL=25, OP2-4 silenced by OL=127). Copy verbatim then adjust `V1` to the
requested voice number:

```
/        AF  OM  WF  SY  SP PMD AMD PMS AMS PAN
(V1,0     7, 15,  0,  0,  0,  0,  0,  0,  0,  3,  0
/        AR  DR  SR  RR  SL  OL  KS  ML DT1 DT2 AME
	 31,  0,  0,  8,  0, 25,  0,  1,  0,  0,  0
	 31,  0,  0,  8,  0,127,  0,  1,  0,  0,  0
	 31,  0,  0,  8,  0,127,  0,  1,  0,  0,  0
	 31,  0,  0,  8,  0,127,  0,  1,  0,  0,  0)
```

Piano-ish (from zm04.txt, algorithm 4 with feedback):
```
/        AF  OM  WF  SY  SP PMD AMD PMS AMS PAN
(V1,0    60, 15,  2,  0,210, 40,  0,  2,  0,  3,  0
/        AR  DR  SR  RR  SL  OL  KS  ML DT1 DT2 AME
	 31,  5,  0, 12,  2, 30,  1,  2,  7,  0,  0
	 31,  5,  0, 12,  8,  6,  1,  2,  5,  0,  0
	 31,  5,  0, 12,  8, 28,  1,  2,  3,  0,  0
	 31,  5,  0, 12,  8,  6,  1,  2,  5,  0,  0)
```

If unsure of a parameter value, copy one of the two templates above and
let the user tweak — do not fabricate operator envelopes from scratch,
and never emit all-zero envelopes.

## Extension code

- TypeScript strict mode. `main` is `./out/src/extension.js`.
- Diagnostic collections split: `zms-lint` (static lint,
  [src/diagnosticProvider.ts](../src/diagnosticProvider.ts)) vs `zmusic`
  (compile errors, [src/player/Diagnostics.ts](../src/player/Diagnostics.ts)).
- `.zms` files are typically SJIS on disk; convert with `iconv-lite` before
  passing to the driver ([src/player/PlayerController.ts](../src/player/PlayerController.ts)).
- Never use `ZMUSIC.peekBytes` (returns raw HEAPU8 without prog_ptr
  translation) — use byte-by-byte `ZMUSIC.peek(addr+i, 0)`
  ([media/player/player.js](../media/player/player.js) `peekBytesSafe`).
