---
name: MyLLM
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system delivers a high-precision, utilitarian Android operational interface built for machine learning engineers, infrastructure operators, and technical power users. The experience prioritizes rigorous observability, deterministic output validation, and exact hardware metrics over decorative styling.

### Design Principles
- **Absolute Determinism:** Ambiguity is treated as an error state. Data values strictly differentiate between null, unavailable, zero, and active inference (`NaN` ≠ `0` ≠ `—`).
- **Tactile Density:** Information architecture conforms to Android system idioms (tactile feedback states, predictable bottom sheets, persistent top app bars) while sustaining the screen density required for telemetry inspection.
- **Instrument Precision:** Surfaces act as monitor terminals. Subtle 1px structural dividers, high-contrast monospace readouts, and disciplined status pings replace subjective ornamentation.

## Colors

The color system operates on an obsidian/slate dark-mode foundation designed to preserve eye comfort during late-night debugging while maximizing token contrast.

### Palette Roles
- **Primary (`#10B981` Emerald):** Represents healthy execution states, successful handshakes, active inference streams, confirmed model contexts, and primary commit actions.
- **Secondary (`#06B6D4` Cyan):** Denotes secondary streaming protocols, active context windows, payload size telemetry, and cold network transfers.
- **Tertiary (`#F59E0B` Amber):** Reserved for non-blocking warnings, fallback model triggers, context window truncation, parameter overrides, and unverified SSL certificates.
- **Error (`#EF4444` Crimson):** Critical failures, endpoint connection drops, context length exhaustion, and schema validation crashes.
- **Neutral Canvas (`#020617` to `#1E293B`):** Multi-tier obsidian base layers provide structural hierarchy without heavy shadows. Text defaults to `#F8FAFC` for primary alphanumeric readouts and `#94A3B8` for secondary telemetry labels.
- **Provenance & Source Tints:**
  - *Live Endpoint:* Emerald glow badge (`#10B981` at 15% opacity).
  - *Local/Bundled:* Neutral slate badge (`#334155` at 40% opacity).
  - *Override/Untrusted:* Amber outline badge (`#F59E0B` at 20% opacity).

## Typography

Typography establishes an intentional contrast between structural structural framing and pure computational readout.

- **Headings (Inter):** Applied to screen titles, modal headers, and top app bars. Inter keeps macro navigation clean, dense, and uncluttered.
- **Body & Data Metrics (JetBrains Mono):** Applied across all conversation streams, JSON payloads, latency numbers (e.g., `42ms`), token counters (`1,024 / 8,192 ctx`), model identifiers (`meta-llama/Llama-3-70b-instruct`), and system validation tags.
- **Numerical Formatting:** All numeric values must use tabular figures with zero slashed when displaying model weights, hashes, and hexadecimal memory addresses.

## Layout & Spacing

Layout adheres to an 8dp computational grid with 4dp half-step sub-grid increments for dense data telemetry.

### Android Canvas Architecture
- **Safe Area Insets:** Strict padding accommodation for Android system navigation bars, gesture handles, status bars, and hardware camera cutouts.
- **Top App Bar:** 56dp standard height holding model switcher pills, latency indicator, and connection status.
- **Bottom Drawers & Sheets:** Modal bottom sheets snap at `45%` (inspection) and `90%` (full configuration) viewport heights.
- **Density Tiering:** Data-heavy lists (token streams, request histories) utilize `space-xs` and `space-sm` internal padding to maximize line efficiency on narrow phone widths.

## Elevation & Depth

This design system uses flat, structural tonal surfaces combined with low-contrast keyline borders (1px solid `#334155` / `#1E293B`) rather than heavy blurred drop shadows. Depth matches native Android elevation levels via tint stepping:

- **Level 0 (Base Canvas):** `#020617` (Deep Obsidian).
- **Level 1 (Card & Module Surface):** `#0B132B` with a 1px border of `#1E293B`.
- **Level 2 (Active Controls & Input Bars):** `#1E293B` with high-contrast emerald focus borders.
- **Level 3 (Bottom Sheets & Context Drawers):** `#0F172A` with a crisp `#334155` top-edge bevel and a 20% alpha black ambient backdrop scrim.
- **Level 4 (Floating System Snackbars / Overlays):** `#1E293B` featuring an emerald accent rim (`#10B981`) and a 4dp vertical offset (`rgba(0, 0, 0, 0.45)`).

## Shapes

Shapes reflect precision technical hardware. Soft corner geometries ensure components look engineered rather than decorative:

- **Standard Elements (Buttons, Inputs, Metric Cells):** 4px (`0.25rem`) corner radius.
- **Cards, Modules, and Code Blocks:** 8px (`0.5rem`) corner radius.
- **Android Bottom Sheets:** Top-left and top-right radii locked at 12px (`0.75rem`), with flat bottom edges.
- **Status Pills & Provenance Tags:** 2px or 4px micro-radii to maintain an industrial tag aesthetic.

## Components

### Buttons
- **Primary:** Background `#10B981`, text `#020617`, font `Inter` 600 weight. Zero shadow; sharp 1px border transition on touch feedback.
- **Technical/Secondary:** Background `#1E293B`, border 1px solid `#334155`, text `#F8FAFC`. Provides monospaced accelerator hints (e.g., `[RUN]`).
- **Destructive/Abort:** Outlined in `#EF4444`, background transparent; switches to filled `#EF4444` during an active inference interrupt.

### Chips & Badges
- **Provenance Tags:**
  - `LIVE`: 1px solid `#10B981`, emerald text, glowing status dot indicator (4px circle).
  - `OVERRIDE`: 1px solid `#F59E0B`, amber text, monospaced uppercase.
  - `BUNDLED`: 1px solid `#475569`, slate muted text.
- **Metrics Chips:** Key-value pairs enclosed in single pill wrappers (e.g., `TTFT: 240ms` or `TOK/S: 48.2`).

### Input Fields & Prompt Consoles
- **Terminal Inputs:** Dark surface (`#0F172A`), monospace input text, `#10B981` solid vertical block caret with optional blink rate toggle.
- **Validation Footers:** Displays real-time context token meter (`342 / 4,096 tokens`) directly under the input boundary. Amber warnings appear at 85% capacity; red appears on context boundary overflow.

### Bottom Sheets & Drawers
- Handles are rendered as subtle 32x4px horizontal pills centered on sheet headers.
- Contains segmented parameter sliders (Temperature, Top-P, Presence Penalty) displaying exact live float values (`0.72`) in JetBrains Mono.

### Untrusted External Content Callouts
- Code payloads, markdown outputs, or tool calls returned by non-local endpoints render with an industrial warning bar on the left edge (2px solid `#06B6D4` or `#F59E0B`), accompanied by a monospace security badge: `UNTRUSTED LLM OUTPUT`.