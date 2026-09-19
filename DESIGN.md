# MyLLM Android Prototype

## Purpose

MyLLM is a technical Android client for a user-supplied OpenAI-compatible endpoint. The prototype makes connection status, model identity, local state, and externally sourced material explicit without adding visual noise.

## Visual direction

The interface uses a warm paper-like canvas with dark, technical conversation surfaces. It borrows an editorial rhythm for reading while keeping operational controls compact and utilitarian.

- **Canvas:** Parchment `#f5f4ed`
- **Surfaces:** Ivory `#faf9f5` and warm sand `#e8e6dc`
- **Primary text:** Near black `#141413`
- **Accent:** Terracotta `#c96442`, reserved for the primary action and active states
- **Status colors:** Green for an active model, warm yellow for cached or constrained states, crimson for destructive or failed actions
- **Depth:** warm borders and restrained ring shadows rather than heavy elevation

## Typography

- **Display:** Anthropic Serif, with Georgia fallback. Used for screen titles, model names, and dialogue titles.
- **UI and body:** Anthropic Sans, with system fallback. Used for controls, explanations, metadata, and navigation.
- **Technical data:** Anthropic Mono, with system monospace fallback. Used for model IDs, URLs, JSON, request IDs, and search queries.

Serif text gives the product a calm editorial voice. Mono is kept for values the user may need to verify or copy. The UI never converts or abbreviates a model ID.

## Layout

The prototype is framed as a 412px Android device on desktop and becomes edge-to-edge on narrow screens.

- Persistent top bar for the page title, current model, and context actions.
- Two-tab bottom navigation: Chat and Model.
- Scrollable content sits above a fixed composer or navigation bar.
- Sheets are used for temporary choices and request detail.
- Dialogs are used before external navigation, data deletion, and one-time tool approval.
- Forms use full-width fields with inline validation and a single primary action.

## Core screens

| Screen | Primary job | Key behaviour |
| --- | --- | --- |
| Loading | Check local connection state | Routes to setup, catalog, or chat in a real product |
| Setup endpoint | Save a custom endpoint and credential | Shows URL preview, security note, validation, and safe failures |
| Model catalog | Select the active model | Keeps exact model IDs visible and distinguishes metadata sources |
| Chat | Start and continue text conversations | Keeps the exact active model visible and the composer available |
| History | Reopen and manage local conversations | Supports new chat, rename, and delete actions |
| Model details | Inspect and adjust a model entry | Shows known metadata and marks unavailable values honestly |
| Settings | Reach endpoint, model, and local data controls | Keeps destructive data removal behind confirmation |

## Interaction rules

- A successful endpoint connection opens the model catalog. It does not skip model selection.
- API keys use a password field and are never rendered after saving.
- A disabled model cannot become active until it is enabled in the picker.
- New chat clears the active view without deleting history.
- Streaming shows the user message first, then a compact generating state. Stopping preserves partial output.
- Request metrics show their source quality: Exact, Estimated, Provider-reported, or Unavailable.
- Context controls explain the hard limit and prevent duplicate compaction while it runs.
- `web_search` requires approval for each call. Results are marked as untrusted external content.
- External links require a confirmation dialog before leaving the app.

## States and trust cues

The design puts uncertain information in clear language rather than filling gaps with plausible values.

- Unknown model metadata is labeled **Unknown** or omitted.
- Missing metrics are labeled **Unavailable**.
- Offline catalog data is shown as saved and requires a refresh when online.
- Connection failures name a safe next action without exposing a credential, prompt, request body, or raw provider response.
- Tool activity is visually separate from assistant messages.
- Source cards show hostname, optional date, a short snippet, and the untrusted-content label.

## Component rules

- Minimum touch target: 42px for icon controls and 46px for primary buttons.
- Cards use 12px to 16px radius; chips use a pill radius only for compact metadata.
- Primary actions use terracotta. Secondary actions use warm sand. Avoid duplicate primary actions in the same viewport.
- Focus uses a visible blue ring reserved for keyboard accessibility.
- Hover changes surface or elevation without reducing text contrast.
- Motion stays short and functional: 150ms to 200ms for taps, sheets, and state changes.

## Prototype scope

The HTML prototype uses local state only. It demonstrates the product flow and states without connecting to a real endpoint, storing credentials, opening external links, or performing web searches.

## Implementation dials

ENERGY 1 / RHYTHM 2 / MOTION 1. The calm, editorial palette keeps long conversations readable; native serif headings separate human-facing names from exact monospace values. Cards group operational choices, and terracotta marks the active action only. Motion stays limited to native press and state feedback.
