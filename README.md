<div align="center">
  <img src="assets/images/icon.png" width="120" alt="MyLLM app icon" />
  <h1>MyLLM</h1>
  <p>An Android chat client for your own OpenAI-compatible endpoints.</p>
</div>

MyLLM connects directly to endpoints that implement the OpenAI Responses API, Chat Completions API, or both. It keeps endpoint credentials in Android secure storage, stores conversation history locally, and gives you control over models, context, tools, and endpoint compatibility.

> [!NOTE]
> MyLLM is under active development. Automated checks cover the implemented Phase 17 scope, while Android device verification and release packaging remain manual.

## Features

- Multiple endpoint profiles with separate credentials, model selections, and protocol settings.
- Model discovery through `GET /models`, searchable catalogs, per-model overrides, and exact model ID preservation.
- Streaming text and reasoning through Responses or Chat Completions, with explicit protocol selection or conservative automatic fallback.
- Local SQLite history with pagination, rename, delete, retry, interrupted-response recovery, and conversation import/export.
- Context estimates, provider usage metrics, manual compaction, and configurable automatic compaction.
- Approval-based function tools for device time, web search through Exa or a private SearXNG gateway, and web fetch through Firecrawl Keyless.
- PNG, JPEG, and WebP image input for models that explicitly declare Responses image support.
- Optional endpoint account usage view when the profile has a documented usage path.
- Redacted diagnostic export and credential-free endpoint profile import/export.

## Requirements

- Node.js 24, as pinned in [`.nvmrc`](.nvmrc)
- npm 11 or newer
- JDK 17
- Android Studio, an Android SDK, and either a device or emulator
- An OpenAI-compatible endpoint and API key

## Getting started

Clone the repository and install dependencies:

```sh
git clone https://github.com/SevikoA3/MyLLM.git
cd MyLLM
npm ci
```

Create and install the Android development build:

```sh
npx expo run:android
```

For later development sessions, start Metro or open the installed Android development build:

```sh
npm start
# or
npm run android
```

On first launch:

1. Enter a profile name, endpoint base URL, and API key.
2. Choose Responses, Chat Completions, or Auto protocol mode.
3. Review advanced route settings if the endpoint does not use the standard paths.
4. Connect to validate the endpoint and discover its models.
5. Select a model from the Catalog tab and start a chat.

The base URL normally includes the provider API prefix, such as `https://api.example.com/v1`. Credentials are entered in the app and must not be added to `.env` or any `EXPO_PUBLIC_*` variable.

## Validation

Run the core automated checks:

```sh
npm run typecheck
npx eslint .
npm run test:ci
```

Node contract tests exercise compiled production modules against local test boundaries:

| Command | Coverage |
|---|---|
| `npm run test:server` | Fake OpenAI-compatible server |
| `npm run test:transport` | Model discovery transport |
| `npm run test:onboarding` | Connect and discovery flow |
| `npm run test:responses` | Responses streaming |
| `npm run test:chat` | Chat Completions streaming |
| `npm run test:protocol` | Explicit and automatic protocol routing |
| `npm run test:web-tools` | Web search and fetch boundaries |
| `npm run test:usage` | Endpoint account usage |
| `npm run test:conversations` | SQLite history, recovery, and portability |
| `npm run test:fields` | Model field normalization |

## Project structure

```text
app/                Expo Router routes, setup, and settings screens
src/domain/         Schemas, types, and pure application logic
src/features/       Chat, history, model, and setup UI flows
src/services/       Network, persistence, credentials, tools, and file I/O
src/ui/             Shared visual tokens and components
test/               Jest tests and Node contract tests
tools/              Contract build, fake server, and smoke-test scripts
graphify-out/       Generated codebase graph and report
```

Feature modules coordinate domain logic, services, and shared UI. Domain modules do not perform I/O. See [`PLAN.md`](PLAN.md) for product decisions and phase gates, [`DESIGN.md`](DESIGN.md) for the visual direction, and [`AGENTS.md`](AGENTS.md) for repository rules.

## Security model

- API keys are stored through Expo SecureStore and referenced by endpoint profiles.
- Requests do not follow redirects, and credentials are sent only to the configured endpoint origin.
- Release builds require HTTPS. Development builds allow cleartext HTTP only for loopback hosts.
- Diagnostics redact sensitive text. Endpoint exports exclude credentials.
- Command execution is disabled.
- Conversation history is stored in local SQLite without SQLCipher encryption.

## Current limits

- Android is the primary target.
- Generation runs only while the app is in the foreground.
- Image input is limited to four supported images, 8 MB per image, and 12 MB per message.
- Generic file uploads, video input, background generation, and shell execution are not implemented.
- Account usage is shown only when an endpoint profile declares a compatible usage path.
