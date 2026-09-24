# MyLLM Design System

`src/ui/tokens.ts` is the visual source of truth for MyLLM. This document defines how those tokens are applied. Every UI change must follow this contract. Do not create local color palettes, font maps, radius scales, motion timings, or competing component standards.

## Design Read

MyLLM is an operational Android client for people who inspect endpoints, models, conversations, context usage, and request telemetry. The interface must make state and technical values easy to scan during long sessions. Its character is precise, restrained, and dense without becoming cramped.

| Dial | Value | Meaning |
|---|---:|---|
| ENERGY | 1 | Calm surfaces and one clear action per view. Status color carries meaning. |
| RHYTHM | 1 | Stable spacing and predictable rows support fast scanning. |
| MOTION | 1 | Motion only explains a state change, such as opening or closing a sheet. |

The identity motif is an Inter structural hierarchy paired with JetBrains Mono technical readouts on flat, keyed dark surfaces. The fixed dark theme supports sustained inspection of model output and telemetry. Emerald marks the main action and healthy state because those two meanings should be found first.

## Tokens

Import values from `src/ui/tokens.ts`. Use `designSystem` when a component needs several token groups, or import individual groups when it needs only one or two.

### Color roles

| Role | Token | Use |
|---|---|---|
| App background | `colors.background` | Safe areas and screen background |
| Deep canvas | `colors.canvas` or `colors.surfaceLowest` | Editors, code, composer wells, and recessed areas |
| Low surface | `colors.surfaceLow` | Cards and grouped content |
| Surface | `colors.surface` | Rows and neutral controls |
| Raised surface | `colors.surfaceHigh` | Active controls, badges, and selected neutral areas |
| Sheet | `colors.sheet` | Bottom sheet body |
| Border | `colors.border` | One-pixel structural boundaries |
| Outline | `colors.outline` | Placeholder text and low-emphasis outlines |
| Primary text | `colors.text` | Titles and content |
| Muted text | `colors.muted` or `colors.textMuted` | Supporting copy and metadata |
| Emerald | `colors.primary` or `colors.accent` | Primary action, success, healthy connection, and active inference |
| Cyan | `colors.secondary` | Informational state, links, and transfer activity |
| Amber | `colors.warning` or `colors.tertiary` | Warning, override, interruption, and approaching limits |
| Red | `colors.danger` or `colors.error` | Destructive action and failure |
| Scrim | `colors.backdrop` | Modal backdrop only |

Use color as state, not decoration. A status dot must represent a real state. Do not add gradients, glow, decorative shadows, or page texture.

### Typography

Inter is the structural face because headings and actions need quick recognition. JetBrains Mono is the data face because identifiers, JSON, counts, and telemetry benefit from stable character widths.

| Role | Token | Family | Use |
|---|---|---|---|
| Display | `typography.display` | Inter Semibold | First-run or major screen title |
| Title | `typography.title` | Inter Semibold | Screen and sheet title |
| Subtitle | `typography.subtitle` | Inter Medium or Semibold | Section emphasis |
| Component title | `typography.componentTitle` | Inter Semibold | Card and empty-state title |
| Body | `typography.body` | JetBrains Mono | Body copy, inputs, and technical values |
| Label | `typography.label` | JetBrains Mono Medium | Row labels and secondary values |
| Meta | `typography.meta` | JetBrains Mono Medium | Badges, status, and telemetry |

Do not use monospace as decoration. Use it when the content is technical or benefits from aligned characters. Keep labels concise and avoid wide tracking beyond compact status labels.

### Spacing and shape

Use the 4 dp spacing rhythm in `spacing`: 4, 8, 12, 16, 24, and 32. Use 16 dp for normal screen gutters, 12 dp inside cards, 8 dp between related controls, and 4 dp between a label and its value. Whitespace must group related information and separate different tasks.

| Shape | Token | Use |
|---|---|---|
| Micro | `radius.micro` | Sheet handles and compact geometry |
| Control | `radius.control` | Buttons, inputs, badges, and rows |
| Card | `radius.card` | Cards, modules, code blocks, and empty-state icons |
| Sheet | `radius.sheet` | Top corners of bottom sheets |
| Bubble | `radius.bubble` | Chat message bubbles only |
| Pill | `radius.pill` | Progress tracks or controls whose function requires a capsule |

Circles, status dots, avatars, and progress tracks may use geometry-specific radii. Other components use the scale above. Flat surfaces and one-pixel borders communicate hierarchy without decorative elevation.

## Layout

- Screens use the app background, safe-area insets, a 16 dp horizontal gutter, and enough bottom padding for system navigation.
- App bars present one title, current context when useful, and only actions that apply to the whole screen.
- Tab bars use the same dark surface hierarchy and show emerald only for the active destination.
- Lists use rows for repeated records. Cards group related settings or a single record with several fields.
- Narrow screens remain the baseline. Wrap status and action rows instead of shrinking text or touch targets.

## Components

### Buttons

| Type | Treatment |
|---|---|
| Primary | Emerald fill, dark text, Inter Semibold, no shadow |
| Secondary | Raised dark surface, one-pixel border when distinction is needed, light or cyan text |
| Destructive | Red fill for confirmation, or red text on a dark surface before confirmation |
| Icon | Relevant platform symbol centered in a square target with an accessible label |

Standard controls use `interaction.touchTarget` at 48 dp. Compact controls use `interaction.compactTouchTarget` at 44 dp. Pressed controls use `interaction.pressedOpacity`; disabled controls use `interaction.disabledOpacity` and expose disabled accessibility state. Button labels name the action, such as `Save web tools` or `Delete conversation`.

### Inputs

- Use a recessed or raised dark surface, body-size monospace text, and outline-colored placeholder text.
- Use a one-pixel border when the input needs separation from its parent. Change that border to emerald while focused.
- Use the emerald cursor and selection color. Preserve platform keyboard behavior and visible validation copy.
- Keep labels outside the field. Explain format or consequences below the field with muted text.
- Errors name what failed and the next corrective action. Never encode validity with color alone.

### Cards, rows, badges, and status

- Cards use `surfaceLow`, a one-pixel border, `radius.card`, and 12 dp internal padding.
- Rows align their primary value first and place metadata or actions after it. Entire-row actions receive one accessible press target.
- Badges use `surfaceHigh`, `radius.control`, meta text, and only enough padding to separate the label.
- Status dots are 5 to 8 dp, have no glow or pulse, and always accompany a text label.
- Emerald means healthy or active, cyan means informational, amber means caution, and red means failure or destructive intent.

### Switches and selectors

- Switch tracks use emerald when enabled and neutral surfaces when disabled. The row label remains readable in either state.
- Radio and segmented choices use a 44 dp minimum target. Selected choices use emerald fill or border plus accessible checked state.
- Show only choices supported by the active endpoint or model.

### Bottom sheets and modals

Use `src/ui/bottom-sheet.tsx` for every bottom sheet. The native `Modal` animation must remain disabled so the scrim does not move with the panel.

- The backdrop fades independently using `motion.backdropIn` and `motion.backdropOut`.
- The sheet translates vertically from and to the bottom using `motion.sheetIn` and `motion.sheetOut`.
- The close animation completes before the modal unmounts.
- The sheet uses `colors.sheet` or `colors.surfaceLow`, a top border, `radius.sheet` top corners, and a centered 32 by 4 dp handle.
- Tapping the backdrop and using the Android back action close the sheet unless an irreversible operation is in progress.
- The sheet exposes a modal accessibility boundary and every backdrop has a specific dismiss label.

This motion separates two jobs: the fade establishes modal focus while the panel movement explains where the temporary controls live. No content inside the backdrop may slide.

## Product states

- Loading states name the resource being loaded when the wait occupies a screen.
- Empty states explain why the collection is empty and offer the next valid action.
- Error states identify the failed operation, preserve safe user input, and provide recovery when available.
- Disabled states remain legible, expose accessibility state, and do not rely on opacity alone when the reason is unclear.
- Warning and destructive confirmations state scope and permanence before the final action.

## Chat

- User and assistant messages use distinct surface roles and `radius.bubble`; live state is shown with text and emerald status.
- The composer stays visually connected to the transcript and keeps attach and send controls at least 44 dp.
- Markdown prioritizes readable body text. Tables scroll when necessary. Code uses a recessed canvas, monospace text, and no simulated terminal decoration.
- Thinking summaries are collapsed by default and use amber as a semantic reasoning marker.
- Context, token use, TTFT, throughput, and cache data use compact monospace labels. Unknown values remain unknown rather than becoming zero.
- Tool approval and interruption states use explicit labels and actions.

## Interaction and accessibility

- Every interactive element has a real behavior, an accessibility role, and a label that describes the result.
- Keep targets at 48 dp, or 44 dp for compact controls. Use hit slop only to extend an already clear visual target.
- Do not rely on color alone. Pair status color with text, icon shape, checked state, or position.
- Respect safe areas, text wrapping, dynamic content length, keyboard avoidance, and Android back behavior.
- Do not add endless animation. State transitions run once and preserve content position after completion.
- Test affected loading, empty, error, disabled, selected, pressed, focused, open, and closing states before delivery.

## UI change checklist

1. Read this document and inspect the existing component before editing.
2. Reuse `src/ui/tokens.ts`, shared UI components, and the nearest established layout pattern.
3. Check all states affected by the change, including accessibility state and narrow-screen wrapping.
4. Confirm that colors, type sizes, spacing, radii, targets, and motion match this contract.
5. Run the Anti Slop UI checklist, TypeScript, ESLint, relevant tests, and the repository delivery gate.
