# MyLLM

<img src="assets/images/logo.png" width="120" alt="MyLLM app icon" />

MyLLM is an Android-first Expo and React Native chat client for custom OpenAI-compatible endpoints. Connect self-hosted, private, or third-party services, discover their models, and keep conversation history on the device.

The project is under active development. Android device behavior, native builds, and release packaging require manual verification by the project owner.

## Features

- Start a new chat on a fresh app launch. Open the sidebar for New chat, saved conversations, and Settings.
- Use Settings icon tabs for General, Models, and Endpoints. Usage appears only when the active endpoint supports a configured account usage route.
- Manage multiple endpoint profiles with separate credentials, model catalogs, and protocol settings.
- Discover models through `GET /models` while preserving provider model IDs.
- Stream text and supported reasoning through Responses or Chat Completions.
- Search, rename, delete, retry, recover, import, and export local conversations.
- Track provider token usage, estimate context size, and compact long conversations.
- Use tools with approval controls, including device time, web search through Exa or a private SearXNG gateway, and web fetch through Jina AI Reader without an API key.
- Attach supported images and documents through the system Files picker when the selected model declares the required input capabilities.
- Export redacted diagnostics and endpoint profiles without credentials.

### Attachments and protocol support

| Protocol | Supported attachment formats |
|---|---|
| Responses | PNG, JPEG, WebP; PDF, text, JSON, CSV/TSV, HTML/XML, Word, RTF/ODT, Excel, and PowerPoint documents |
| Chat Completions | PNG, JPEG, WebP, and PDF |
| Auto | Uses Responses for requests containing attachments |

Each message can include **up to 10 attachments**, with **10 MB per file** and **80 MB total**. The selected model must declare image or file input support. Unknown capabilities require an explicit metadata override in Settings > Models. Provider size and context limits may be lower than these app limits.

Endpoint compatibility varies. Advanced endpoint settings allow custom routes, authentication, and Responses, Chat Completions, or Auto protocol selection. Auto starts with Responses when no successful protocol is cached and permits limited fallback on compatibility errors before output begins. Attachment requests always use Responses in Auto mode. There is no universal standalone file upload flow.

Generation remains foreground-only. Video input, background generation, and shell command execution are not implemented. Large attachment selections still require Android memory testing.

## Getting started

### Requirements

- Node.js 24 and npm 11.
- An OpenAI-compatible endpoint and its API key.
- For Expo Go: an Android phone with an Expo Go version that supports the project's Expo SDK.
- For native Android builds: JDK 17, Android Studio with the Android SDK and required build tools, and an emulator or an Android device configured for debugging. Configure the local SDK path and ensure the build uses JDK 17.

### Generated toolchain

These dependency versions are declared in [package.json](package.json). [package-lock.json](package-lock.json) records the resolved dependency tree used by `npm ci`.

| Component | Declared version |
|---|---|
| Expo | `~57.0.25`, SDK 57 |
| React Native | `0.86.3` |
| React | `19.2.3` |
| NativeWind | `5.0.0-rc.0` |
| react-native-css | `3.1.0-rc.0` |
| Tailwind CSS | `4.1.12` |
| Lightning CSS | `1.30.1` |

Clone the repository and install its locked dependencies:

```sh
git clone https://github.com/SevikoA3/MyLLM.git
cd MyLLM
npm ci
```

### Run with Expo Go

Start the development server:

```sh
npm start
```

Keep the computer and phone on the same network, then scan the QR code with Expo Go. The installed Expo Go version must support SDK 57 and the native modules the app uses. If it cannot load this project, use the native debug workflow below.

To clear Metro's cache when diagnosing stale JavaScript or styling:

```sh
npm start -- --clear
```

If the phone cannot reach the computer over the local network, an optional tunnel can help:

```sh
npm start -- --tunnel
```

Tunnel mode may require the optional tunnel helper requested by Expo CLI. Follow the CLI setup prompt if needed. A tunnel changes how the phone reaches Metro; it does not fix Gradle dependency downloads.

### Configure an endpoint

1. On first launch, enter a profile name, endpoint base URL, and API key.
2. Open Advanced to choose authentication, protocol, or a custom model discovery path.
3. Use Connect to validate the endpoint and load its models.
4. Select a model in the chat model picker and send a message.
5. Open the sidebar to return to saved conversations or enter Settings. Use Models to manage visibility and metadata, and Endpoints to manage profiles. General includes history management and app settings.

The base URL usually includes the provider API prefix, such as `https://api.example.com/v1`. A fresh launch opens a new chat; it does not automatically resume the last saved conversation. The sidebar also opens with a swipe from the left edge and closes with a left swipe inside it.

Enter Android credentials only in the app. They are stored through Expo SecureStore. The app does not read API keys from a developer's `.env` file.

### Web fetch with Jina AI Reader

Enable web search and fetch in General after configuring Exa or your private Search Gateway. `web_fetch` sends the selected public URL to `https://r.jina.ai/` without an API key or search credentials. Search still uses the selected search provider.

The app uses JSON POST so URL fragments, including SPA routes, reach Reader:

```sh
curl 'https://r.jina.ai/' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://example.com/#/route"}'
```

Reader returns page metadata and Markdown in `data.content`. The app forwards the raw JSON to the model and reads only source-card fields for display. Existing limits remain: 40 seconds for the request, 64 KB for the response, and 12 KB for tool output. Oversized content is rejected without truncation or automatic retries. Saved Firecrawl source cards remain readable.

As checked on 11 October 2026, [Jina's documentation](https://jina.ai/reader/) lists free access without a key at 20 requests per minute per IP. API keys raise the limit and charge tokens; the app uses no Jina key. Jina Search (`s.jina.ai`) requires a key and is not used. See the [Reader usage guide](https://github.com/jina-ai/reader#spas-with-hash-based-routing) for POST and JSON options.

## Native Android development

These workflows use the local Android toolchain. The project has no EAS Build configuration and does not include `expo-dev-client`.

### Build and install a debug app

From the repository root:

```sh
npx expo run:android
```

Expo generates the Android project if it is absent, builds and installs a debug app, and starts Metro. This requires the Android SDK and a configured device or emulator.

For later JavaScript-only development sessions, start Metro from the repository root and open the installed debug app:

```sh
npm start
```

For a physical Android device connected over USB, restore port forwarding after reconnecting or rebooting the device:

```sh
adb reverse tcp:8081 tcp:8081
```

Use the actual Metro port if it differs from 8081. If multiple devices are attached, select the intended device with `adb -s <serial> reverse tcp:8081 tcp:8081`. For LAN access instead, set the computer's reachable address and Metro port in the app's React Native Dev Menu. Expo Go QR and tunnel links do not automatically configure this native debug app.

Use `npm start` for JavaScript-only sessions. Rebuild when native dependencies or native configuration change.

### Regenerate native configuration

When changes to [app.json](app.json) or native dependencies affect the Android project, apply them before rebuilding:

```sh
npx expo prebuild --platform android
npx expo run:android
```

Review any local native edits before regeneration. Do not use `--clean` as the default: it deletes and recreates the generated project. Native output under `android/` is ignored by Git. After dependency changes, the owner should also run `npm run doctor` to check Expo compatibility.

## Local release builds

For a local release build installed on a configured Android device or emulator:

```sh
npx expo run:android --variant release
```

Release builds bundle JavaScript and do not use Metro at runtime. Building the release variant is a local validation step; it does not establish distribution readiness.

To generate an APK or AAB directly, first generate the Android project if `android/` is absent:

```sh
npx expo prebuild --platform android
```

Then run the required Gradle task from that directory:

```sh
cd android
./gradlew :app:assembleRelease --no-daemon
./gradlew :app:bundleRelease --no-daemon
```

The two tasks produce different artifacts. Run only the task you need, or both if you need both outputs.

| Artifact | Default output path from the repository root |
|---|---|
| Release APK | `android/app/build/outputs/apk/release/app-release.apk` |
| Release AAB | `android/app/build/outputs/bundle/release/app-release.aab` |

The existing generated Android configuration uses **debug signing for the release variant**. For distribution, create your own release or upload keystore, configure release signing, and protect the keystore and its passwords outside version control. Review generated signing configuration after regeneration. Complete the manual Android and security checks in [PLAN.md](PLAN.md) before distributing a build.

## Checks and tests

For source changes, run the core checks from the repository root:

```sh
npm run typecheck
npx eslint .
npm run test:ci
```

Use direct ESLint for agent checks. The `npm run lint` script invokes Expo. `npm test` runs Jest in watch mode. Documentation-only changes do not require source-code tests.

Focused Node contract tests use production code and fake credentials:

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

Run the relevant contract tests when changing transport, persistence, or onboarding behavior. Scripts that invoke [tools/build-tests.mjs](tools/build-tests.mjs) compile production modules into `.tests-build/`. Run those scripts sequentially because they share that generated directory, and do not commit it.

### Optional live endpoint tools

The terminal tools `npm run smoke:models` and `npm run smoke:responses` read `AMANAI_ENDPOINT` and `AMANAI_KEY` from the environment or an ignored local `.env` file. `AMANAI_MODEL` optionally selects the Responses smoke-test model. See [.env.example](.env.example) for the terminal-only variables.

These variables are not Android app configuration. Never put secrets in `EXPO_PUBLIC_*` variables or committed fixtures. `smoke:models` calls model discovery; `smoke:responses` sends two live generation requests that may incur charges. Run live tools deliberately, separate from automated checks, and report only results you actually observed.

## Troubleshooting

### Gradle cannot resolve a repository host

Errors such as `dl.google.com: Temporary failure in name resolution` mean the build computer cannot resolve a dependency repository's hostname. Gradle cannot download the requested artifact until connectivity recovers. The reported Glide `5.0.5` artifact is available on Maven Central; changing its version does not resolve DNS failures.

On the build computer, check resolution for the public repository and Gradle hosts:

```sh
getent hosts dl.google.com
getent hosts repo.maven.apache.org
getent hosts services.gradle.org
```

Check HTTPS access to the public Maven repositories:

```sh
curl -I https://dl.google.com/dl/android/maven2/com/android/tools/build/gradle/maven-metadata.xml
curl -I https://repo.maven.apache.org/maven2/
curl -I https://repo.maven.apache.org/maven2/com/github/bumptech/glide/glide/5.0.5/glide-5.0.5.pom
```

If resolution or access fails, reconnect the network and check the active interface's router, DNS, and VPN configuration. On Linux systems using systemd-resolved, inspect the configured resolvers and optionally flush cached DNS results:

```sh
resolvectl status
sudo resolvectl flush-caches
```

A cache flush does not guarantee recovery. Repeat the host and HTTPS checks to confirm that resolution and access are reliable. After connectivity is restored, an existing Gradle daemon may retain a negative DNS result. The owner can optionally stop it from `android/`:

```sh
./gradlew --stop
```

Retry the same build command after connectivity is restored. Keep the existing Gradle caches. Use `--offline` only when every required plugin and dependency artifact is already cached; it cannot supply missing downloads.

The separate deprecated-Gradle-feature warning does not cause this DNS error. Use `--warning-mode all` on an owner-run Gradle build to identify deprecations separately.

### The phone cannot connect to Metro

Confirm that the phone and computer share a network and that the firewall permits the development server. Restart with `npm start -- --clear` for stale bundle problems. Use `npm start -- --tunnel` when local network access is unavailable, and confirm that Expo Go supports the project SDK. Native configuration changes require regeneration and rebuilding the installed debug app.

## Project structure and contribution

```text
app/                Expo Router routes and screen entry points
src/domain/         Schemas, types, and pure application logic
src/features/       Chat, history, model, and setup UI flows
src/services/       Network, persistence, credentials, tools, and file I/O
src/ui/             Shared visual tokens and components
test/               Jest and Node contract tests
tools/              Contract build and smoke-test scripts
```

Read [AGENTS.md](AGENTS.md) for contributor constraints and [PLAN.md](PLAN.md) for requirements, phase decisions, and acceptance gates. Read [DESIGN.md](DESIGN.md) before changing UI, layout, styling, or motion. Use shared visual tokens and components, keep domain logic independent of I/O, and make focused changes within the authorized scope.

Repository agents run TypeScript, direct ESLint, Jest, and Node contract checks only. The project owner runs Expo, Metro, Android builds, emulator checks, and device checks.

The implementation recorded in PLAN.md reaches Phase 17. Background generation was skipped by product decision, and command execution remains deferred. Active development continues within those product decisions. Automated checks do not replace manual checks of Android layout, keyboard behavior, accessibility, attachments, import/export, or endpoint switching.

## Security

- Enter endpoint and tool credentials in the app and store them through Expo SecureStore, backed by Android Keystore protection.
- Send credentials only to the configured endpoint origin. Authenticated requests do not follow redirects.
- Require HTTPS in release builds. Development cleartext HTTP is limited to loopback hosts.
- Keep API keys, prompts, responses, and tool output out of logs. Review redacted diagnostics before sharing them.
- Export endpoint profiles without credentials, and keep keystores, passwords, and local environment files out of version control.

Conversation history is stored in local SQLite without SQLCipher encryption. Protect the device, transcripts, and exported files accordingly.

## License

No license file is currently tracked in this repository. Confirm permission with the project owner before redistributing the source or builds.
