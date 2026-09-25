<div align="center">
  <img src="assets/images/icon.png" width="120" alt="MyLLM app icon" />
  <h1>MyLLM</h1>
  <p>An Android chat client for custom OpenAI-compatible endpoints.</p>

  <p>
    <a href="#features">Features</a> ·
    <a href="#compatibility">Compatibility</a> ·
    <a href="#getting-started">Getting started</a> ·
    <a href="#development">Development</a> ·
    <a href="#security">Security</a>
  </p>
</div>

MyLLM is an Android-first Expo and React Native application for people who use self-hosted, private, or third-party OpenAI-compatible services. Connect multiple endpoints, discover their models, choose a protocol, and keep conversations on the device.

> [!NOTE]
> MyLLM is under active development. Android device verification and release packaging are currently manual.

## Features

- Manage multiple endpoint profiles with separate credentials, models, and protocol settings.
- Discover models through `GET /models` without changing provider model IDs.
- Stream text and reasoning through the Responses API or Chat Completions API.
- Store conversation history locally with pagination, rename, delete, retry, recovery, import, and export.
- Track provider usage, estimate context size, and compact long conversations.
- Approve function tools before they run, including device time, web search, and web fetch.
- Attach PNG, JPEG, and WebP images when the selected model declares image support.
- Export redacted diagnostics and endpoint profiles without credentials.

## Compatibility

| Capability | Support |
|---|---|
| Android | Primary target |
| OpenAI Responses API | Supported |
| OpenAI Chat Completions API | Supported |
| Automatic protocol fallback | Conservative fallback between supported protocols |
| Model discovery | `GET /models` |
| Web search | Exa or a private SearXNG gateway |
| Web fetch | Firecrawl Keyless |
| Image input | PNG, JPEG, and WebP for declared-compatible models |

OpenAI-compatible services vary in the routes and fields they implement. MyLLM supports custom route settings and per-model capability overrides for endpoints that differ from the standard API shape.

## Getting started

### Requirements

- Node.js 24, as pinned in [`.nvmrc`](.nvmrc)
- npm 11 or newer
- JDK 17
- Android Studio and an Android SDK
- An Android device or emulator
- An OpenAI-compatible endpoint and API key

### Install

```sh
git clone https://github.com/SevikoA3/MyLLM.git
cd MyLLM
npm ci
npx expo run:android
```

The final command creates and installs an Android development build. For later sessions, start Metro or open the installed build:

```sh
npm start
# or
npm run android
```

### Configure an endpoint

On first launch:

1. Enter a profile name, endpoint base URL, and API key.
2. Choose Responses, Chat Completions, or Auto protocol mode.
3. Adjust the route settings if the endpoint uses nonstandard paths.
4. Connect to validate the endpoint and discover its models.
5. Select a model in the Catalog tab and start a conversation.

The base URL usually includes the provider API prefix, such as `https://api.example.com/v1`. Enter credentials only in the app. Do not add API keys to `.env` or an `EXPO_PUBLIC_*` variable.

## Development

Run the main checks before submitting a change:

```sh
npm run typecheck
npx eslint .
npm run test:ci
```

The repository also includes focused Node contract tests:

| Command | Checks |
|---|---|
| `npm run test:server` | Fake OpenAI-compatible server |
| `npm run test:transport` | Model discovery transport |
| `npm run test:onboarding` | Endpoint connection and discovery |
| `npm run test:responses` | Responses streaming |
| `npm run test:chat` | Chat Completions streaming |
| `npm run test:protocol` | Explicit and automatic protocol routing |
| `npm run test:web-tools` | Web search and fetch boundaries |
| `npm run test:usage` | Endpoint account usage |
| `npm run test:conversations` | Conversation storage, recovery, and portability |
| `npm run test:fields` | Model field normalization |

### Project structure

```text
app/                Expo Router routes and screens
src/domain/         Schemas, types, and pure application logic
src/features/       Chat, history, model, and setup UI flows
src/services/       Network, persistence, credentials, tools, and file I/O
src/ui/             Shared visual tokens and components
test/               Jest and Node contract tests
tools/              Contract build and smoke-test scripts
```

Feature modules coordinate domain logic, services, and shared UI. Domain modules remain independent of I/O. Repository decisions and contributor rules are documented in [`PLAN.md`](PLAN.md), [`DESIGN.md`](DESIGN.md), and [`AGENTS.md`](AGENTS.md).

## Security

- API keys are stored through Expo SecureStore and are not included in endpoint exports.
- Credentials are sent only to the configured endpoint origin, and requests do not follow redirects.
- Release builds require HTTPS. Development builds permit cleartext HTTP only for loopback hosts.
- Diagnostic exports redact sensitive text.
- Shell command execution is not available.

Conversation history is stored in local SQLite without SQLCipher encryption. Treat the device and its backups as part of your security boundary.

## Project status

MyLLM is developed in phases tracked in [`PLAN.md`](PLAN.md). The current implementation is intended for development and testing rather than a packaged public release.

Current limitations:

- Android is the primary target.
- Generation runs only while the app is in the foreground.
- A message can include up to four images, with an 8 MB limit per image and a 12 MB combined limit.
- Generic file upload, video input, background generation, and shell execution are not implemented.
- Account usage appears only when an endpoint profile declares a compatible usage route.

## Contributing

Issues and focused pull requests are welcome. Before making a change, read [`AGENTS.md`](AGENTS.md) for repository constraints and [`PLAN.md`](PLAN.md) for the active phase and acceptance gates. Keep changes within the current phase and include the relevant checks.

## License

No license has been added to this repository. Copyright law therefore reserves all rights to the project owner. You may inspect and contribute to the source through GitHub, but redistribution and reuse are not granted until a license is published.
