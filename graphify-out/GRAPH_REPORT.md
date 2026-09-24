# Graph Report - myllm  (2026-09-25)

## Corpus Check
- 155 files · ~123,431 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .ttf 1)

## Summary
- 1275 nodes · 2794 edges · 74 communities (58 shown, 16 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Endpoint Domain Schema
- Settings and Data Cleanup
- Conversation Export Schema
- Chat Screen and Usage
- Tool Policy and Validation
- Chat Tools and Gateway
- Model Detail Overrides
- Responses API Transport
- Expo Runtime Dependencies
- Conversation Repository
- Endpoint HTTP and Usage
- Context Compaction
- Package Runtime Configuration
- Catalog Schemas
- Catalog File Storage Tests
- Android App Configuration
- Node Contract Tests
- Conversation Repository
- Chat Completions Transport
- Model Parsing and Types
- Chat Hook Tests
- Fake OpenAI Server
- Model Catalog UI
- Catalog File Assets
- NPM Scripts
- Catalog Merge Logic
- Chat State
- Catalog Repository
- App Routing and Bootstrap
- Shared UI Theme
- Image Attachments
- Model Catalog Hook
- Error Redaction
- Conversation Repository
- Endpoint Management Screen
- Context Compaction
- Protocol Routing
- Project Governance
- Usage and Endpoint Hooks
- Image Storage
- Test Build Scripts
- Development Tooling Dependencies
- Context Compaction
- Model JSON Editor UI
- Project Governance
- SSE Parser
- Usage and Endpoint Hooks
- TypeScript Configuration
- Conversation Contract Tests
- Model Smoke Test
- Endpoint Field Inspection
- ESLint Configuration
- Phase Two Exit Gate
- Metro NativeWind Configuration
- Jest Configuration
- Project Governance
- Model Field Contract Tests
- Onboarding Contract Tests
- App Identity
- Chat Completions Transport
- Technical Research
- Product Design Direction
- NativeWind Types
- Package Runtime Configuration
- Development Workflow
- Android Icon Background
- Android App Icon
- Monochrome Android Icon
- Favicon
- Primary App Icon
- Splash Icon

## God Nodes (most connected - your core abstractions)
1. `createConversationRepository()` - 38 edges
2. `createAppError()` - 31 edges
3. `useChat()` - 27 edges
4. `initialize()` - 25 edges
5. `scripts` - 22 edges
6. `EndpointProfile` - 22 edges
7. `createEndpointProfile()` - 21 edges
8. `useActiveEndpoint()` - 20 edges
9. `sendAttempt()` - 19 edges
10. `write()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `withDeps()` --indirect_call--> `discoverModels()`  [INFERRED]
  test/contract/onboarding.test.mjs → src/services/transport/models.ts
- `remove()` --indirect_call--> `deleteStagedImages()`  [INFERRED]
  app/settings/endpoints.tsx → src/services/attachments/images.ts
- `onConnect()` --indirect_call--> `authMode()`  [INFERRED]
  app/setup.tsx → tools/fake-oai-server.mjs
- `dispatch()` --indirect_call--> `event()`  [INFERRED]
  src/domain/sse.ts → tools/fake-oai-server.mjs
- `EntryScreen()` --calls--> `useActiveEndpoint()`  [EXTRACTED]
  app/index.tsx → src/features/setup/use-active-endpoint.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Phase Delivery Controls** — agents_phase_execution, agents_exit_gate, agents_test_requirements, agents_graph_refresh [EXTRACTED 1.00]
- **Sequential MVP Delivery** — plan_document_phase_1, plan_document_phase_2, plan_document_phase_3, plan_document_phase_4, plan_document_phase_5, plan_document_phase_6, plan_document_phase_7, plan_document_phase_8, plan_document_phase_9 [EXTRACTED 1.00]

## Communities (74 total, 16 thin omitted)

### Community 0 - "Endpoint Domain Schema"
Cohesion: 0.05
Nodes (53): cardStyle, colors, Edits, fonts, SetupScreen(), onConnect(), expo-secure-store, AuthMode (+45 more)

### Community 1 - "Settings and Data Cleanup"
Cohesion: 0.06
Nodes (41): cardStyle, colors, fonts, SettingsScreen(), clearData(), exportDiagnostics(), saveWebTools(), selectWebSearchProvider() (+33 more)

### Community 2 - "Conversation Export Schema"
Cohesion: 0.05
Nodes (43): EndpointProfilesScreen(), exportProfiles(), importProfiles(), load(), remove(), select(), expo-document-picker, expo-sharing (+35 more)

### Community 3 - "Chat Screen and Usage"
Cohesion: 0.06
Nodes (33): react-native-markdown-display, ContextBudgetResult, contextPolicy, buildTurnMetrics(), duration(), formatCount(), formatDuration(), formatPercent() (+25 more)

### Community 4 - "Tool Policy and Validation"
Cohesion: 0.08
Nodes (43): DEFAULT_TOOL_POLICY, parseToolArguments(), requiresApproval(), StoredToolCall, TOOL_APPROVALS, TOOL_RISKS, ToolActivity, ToolApproval (+35 more)

### Community 5 - "Chat Tools and Gateway"
Cohesion: 0.08
Nodes (37): testGateway(), ToolExecutionError, ToolExecutor, isRecord(), isWebUrl(), MAX_WEB_FETCH_OUTPUT_BYTES, MAX_WEB_SEARCH_COUNT, MAX_WEB_SEARCH_OUTPUT_BYTES (+29 more)

### Community 6 - "Model Detail Overrides"
Cohesion: 0.07
Nodes (22): effectiveMaxOutput(), modelRequestSnapshot, protocolOutputCap(), reasoningChoices(), arrayText(), buildOverride(), CapabilityChoice, capabilityLabel() (+14 more)

### Community 7 - "Responses API Transport"
Cohesion: 0.09
Nodes (41): expo, EndpointProfile, AppError, imageDataUrl(), PartialStreamResponse, ResponseStreamEvent, SendResponseInput, SendResponseMeta (+33 more)

### Community 8 - "Expo Runtime Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, expo, expo-constants, expo-document-picker, expo-file-system, expo-font, @expo-google-fonts/inter, @expo-google-fonts/jetbrains-mono (+26 more)

### Community 9 - "Conversation Repository"
Cohesion: 0.10
Nodes (24): expo-sqlite, ChatMessage, ConversationCursor, ConversationInputMessage, ConversationSummary, titleFromPrompt(), CompactionRow, CompactionTurnRow (+16 more)

### Community 10 - "Endpoint HTTP and Usage"
Cohesion: 0.16
Nodes (23): buildAuthHeaders(), buildCustomHeaders(), joinEndpointPath(), bodyTooLargeError(), fromNetworkError(), parseModelList(), createWebGatewayClient(), MAX_RESPONSE_BODY_BYTES (+15 more)

### Community 11 - "Context Compaction"
Cohesion: 0.12
Nodes (24): buildCompactedContext(), buildCompactionPrompt(), COMPACTION_PROMPT_VERSION, CompactionSelection, CompactionSummary, CompactionSummarySchema, CompactionTurn, parseCompactionSummary() (+16 more)

### Community 12 - "Package Runtime Configuration"
Cohesion: 0.08
Nodes (25): main, name, private, version, expo-constants, expo-image-picker, expo-linking, expo-splash-screen (+17 more)

### Community 13 - "Catalog Schemas"
Cohesion: 0.09
Nodes (24): CapabilityOverridesSchema, CapabilityStateSchema, CatalogModelFieldsSchema, CatalogSnapshot, CatalogSnapshotSchema, changedOverrideModelIds(), finitePositiveInt, HistoryModelsFile (+16 more)

### Community 14 - "Catalog File Storage Tests"
Cohesion: 0.11
Nodes (11): save(), fileCatalogStorage, assertPath(), document(), joinPath(), mockCalls, MockDirectory, MockFile (+3 more)

### Community 15 - "Android App Configuration"
Cohesion: 0.08
Nodes (24): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, allowBackup, package, versionCode (+16 more)

### Community 16 - "Node Contract Tests"
Cohesion: 0.12
Nodes (14): ref_node_assert, ref_node_child_process, ref_node_http, ref_node_test, input, HEADERS, input, input (+6 more)

### Community 17 - "Conversation Repository"
Cohesion: 0.22
Nodes (25): orphanedImageAttachments(), contentJson(), createConversationRepository(), beginCompaction(), clear(), completeCompaction(), countByEndpoint(), enqueueWrite() (+17 more)

### Community 18 - "Chat Completions Transport"
Cohesion: 0.16
Nodes (24): AttemptMeta, AttemptResult, buildChatCompletionsBody(), CHAT_COMPLETIONS_TIMEOUT_MS, chatCompletionsClient, chatCompletionsUrl(), complete(), emit() (+16 more)

### Community 19 - "Model Parsing and Types"
Cohesion: 0.13
Nodes (20): zod, CapabilityState, InputModality, EnrichedModelFieldsSchema, inferVendor(), MODALITIES, ModelParseResult, normalizeModalities() (+12 more)

### Community 20 - "Chat Hook Tests"
Cohesion: 0.08
Nodes (21): mockCredentialRead, mockDeleteStagedImages, mockDeleteUnreferencedStagedImages, mockFinishTurn, mockFlushAssistant, mockInputModalities, mockLoadConversation, mockLoadImageAttachments (+13 more)

### Community 21 - "Fake OpenAI Server"
Cohesion: 0.14
Nodes (21): authMode(), chatStream(), chatToolStream(), chatUsage(), checkAuth(), completed(), ENRICHED_MODELS, event() (+13 more)

### Community 22 - "Model Catalog UI"
Cohesion: 0.13
Nodes (13): MergedModel, describeRefresh(), formatTokens(), modelBadges(), shortTime(), BadgeTone, capabilityValue(), cardStyle (+5 more)

### Community 23 - "Catalog File Assets"
Cohesion: 0.13
Nodes (19): assets_model_defaults, CatalogDefaults, CatalogDefaultsSchema, catalogDirectory(), deleteCatalogForEndpoint(), file(), backupFileName(), CATALOG_DIR (+11 more)

### Community 24 - "NPM Scripts"
Cohesion: 0.09
Nodes (22): scripts, android, doctor, ios, lint, smoke:models, smoke:responses, start (+14 more)

### Community 25 - "Catalog Merge Logic"
Cohesion: 0.15
Nodes (20): CatalogModelFields, HistoryModelEntry, CapabilityStateValue, CATALOG_SOURCES, CatalogSource, collect(), contextPolicyValue(), inferVendor() (+12 more)

### Community 26 - "Chat State"
Cohesion: 0.17
Nodes (20): createAppError(), ChatState, contextBudgetFor(), contextHardStopError(), localRequestError(), message(), missingCredentialError(), modelConfigError() (+12 more)

### Community 27 - "Catalog Repository"
Cohesion: 0.23
Nodes (20): serializeModelOverrides(), createCatalogRepository(), applyOverrides(), applyOverridesText(), load(), previewOverrides(), readHistory(), refresh() (+12 more)

### Community 28 - "App Routing and Bootstrap"
Cohesion: 0.13
Nodes (12): colors, fonts, colors, global, expo-font, @expo-google-fonts/inter, @expo-google-fonts/jetbrains-mono, expo-router (+4 more)

### Community 29 - "Shared UI Theme"
Cohesion: 0.20
Nodes (14): react-native, InfoBlock(), LinkCard(), PlaceholderScreen(), PrimaryButton(), Screen(), tonePalette(), dark (+6 more)

### Community 30 - "Image Attachments"
Cohesion: 0.15
Nodes (12): IMAGE_ATTACHMENT_ERROR_COPY, IMAGE_MIME_TYPES, ImageAttachment, ImageAttachmentSchema, ImageMimeTypeSchema, MAX_IMAGE_ATTACHMENTS, MAX_IMAGE_BYTES, MAX_MESSAGE_IMAGE_BYTES (+4 more)

### Community 31 - "Model Catalog Hook"
Cohesion: 0.17
Nodes (14): ModelOverride, ModelCatalogState, bytesToBase64(), CatalogCache, CatalogRepository, CatalogRepositoryDeps, CatalogRuntime, defaultSnapshot() (+6 more)

### Community 32 - "Error Redaction"
Cohesion: 0.22
Nodes (13): AppErrorInput, appErrorToDiagnostic(), categorizeHttpStatus(), ErrorCategory, fromHttpResponse(), isRecord(), parseProviderErrorBody(), pickString() (+5 more)

### Community 33 - "Conversation Repository"
Cohesion: 0.21
Nodes (16): isRecord(), normalizeUsage(), numberAt(), database(), exportConversation(), loadCompactionSource(), loadConversation(), loadImageAttachments() (+8 more)

### Community 34 - "Endpoint Management Screen"
Cohesion: 0.15
Nodes (9): colors, DeleteTarget, fonts, colors, fonts, react, credentialStore, conversationRepository (+1 more)

### Community 35 - "Context Compaction"
Cohesion: 0.24
Nodes (12): APP_AUTO_OUTPUT_BUDGET, buildContextBudget(), clampPercent(), CONTEXT_ITEM_OVERHEAD_TOKENS, CONTEXT_MAX_SAFETY_MARGIN, CONTEXT_MIN_SAFETY_MARGIN, CONTEXT_TOKEN_BYTES_DIVISOR, ContextBudgetInput (+4 more)

### Community 36 - "Protocol Routing"
Cohesion: 0.21
Nodes (13): chatCompletionsTransport, createProtocolTransport(), send(), FALLBACK_STATUSES, isProtocolFallbackError(), loadCached(), opposite(), ProtocolCache (+5 more)

### Community 37 - "Project Governance"
Cohesion: 0.18
Nodes (12): DESIGN.md, Phase Exit Gate, Graph Refresh Workflow, graphify-out/graph.json, Layered Architecture, No Expo or Android Builds by Agent, Sequential Phase Execution, PLAN.md (+4 more)

### Community 38 - "Usage and Endpoint Hooks"
Cohesion: 0.22
Nodes (8): EntryScreen(), UsageScreen(), @testing-library/react-native, ActiveEndpointState, useActiveEndpoint(), endpointStore, subscribeEndpointChanges(), mockLoad

### Community 39 - "Image Storage"
Cohesion: 0.21
Nodes (10): ImageAttachmentRejection, deleteStagedImages(), deleteUnreferencedStagedImages(), directory(), extension(), ImagePickerResolver, newId(), stageImageAttachment() (+2 more)

### Community 40 - "Test Build Scripts"
Cohesion: 0.17
Nodes (8): ref_node_fs, ref_node_path, ENTRIES, STUBS, walk(), env, profile, root

### Community 41 - "Development Tooling Dependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-expo, lightningcss, postcss, tailwindcss, @tailwindcss/postcss, @testing-library/react-native (+3 more)

### Community 42 - "Context Compaction"
Cohesion: 0.22
Nodes (7): BeginCompactionInput, CompactionSource, CompleteCompactionInput, client(), profile, response(), summary

### Community 43 - "Model JSON Editor UI"
Cohesion: 0.22
Nodes (3): colors, fonts, OverridesPreview

### Community 44 - "Project Governance"
Cohesion: 0.22
Nodes (9): Phase 1 Domain Contracts and Fake Endpoint, Phase 2 Endpoint Onboarding and Secure Credentials, Phase 3 Model Catalog and Picker, Phase 4 Non-stream Chat, Phase 5 Responses Streaming and Cancellation, Phase 6 SQLite Conversation History and Recovery, Phase 7 Model Controls and Editable JSON, Phase 8 Usage Normalization and Metrics (+1 more)

### Community 45 - "SSE Parser"
Cohesion: 0.33
Nodes (7): createSseParser(), dispatch(), drain(), line(), SseFrame, SseParseResult, encoder

### Community 46 - "Usage and Endpoint Hooks"
Cohesion: 0.25
Nodes (8): ModelsScreen(), useModelCatalog(), mockCounter, mockFiles, mockResponder, MODEL, profile, setup()

### Community 47 - "TypeScript Configuration"
Cohesion: 0.25
Nodes (7): expo/tsconfig.base, compilerOptions, paths, strict, types, extends, include

### Community 48 - "Conversation Contract Tests"
Cohesion: 0.29
Nodes (4): ref_node_os, ref_node_sqlite, adapter(), setup()

### Community 49 - "Model Smoke Test"
Cohesion: 0.25
Nodes (6): ref_node_url, env, files, profile, repository, root

### Community 50 - "Endpoint Field Inspection"
Cohesion: 0.25
Nodes (5): env, keys, missing, root, types

### Community 51 - "ESLint Configuration"
Cohesion: 0.29
Nodes (6): { defineConfig }, expoConfig, globals, eslint, eslint-config-expo, ref_globals

### Community 52 - "Phase Two Exit Gate"
Cohesion: 0.33
Nodes (5): keyValueStore, kv, secure, secureStore, server

### Community 53 - "Metro NativeWind Configuration"
Cohesion: 0.40
Nodes (4): config, { getDefaultConfig }, { withNativewind }, nativewind

### Community 54 - "Jest Configuration"
Cohesion: 0.40
Nodes (5): jest, modulePathIgnorePatterns, preset, roots, transformIgnorePatterns

### Community 55 - "Project Governance"
Cohesion: 0.40
Nodes (5): MyLLM Implementation Plan, Repository Architecture, Executor Contract, Product Defaults, Android LLM Client Product Goal

### Community 56 - "Model Field Contract Tests"
Cohesion: 0.40
Nodes (3): CAMPAIGN, FLASH, GLM

### Community 60 - "Technical Research"
Cohesion: 0.67
Nodes (3): AmanAI Reference Profile, React Native Android LLM Client Research, Protocol Auto Routing

## Knowledge Gaps
- **384 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+379 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 518 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Expo Runtime Dependencies` to `Package Runtime Configuration`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `zod` connect `Model Parsing and Types` to `Endpoint Domain Schema`, `Settings and Data Cleanup`, `Conversation Export Schema`, `Context Compaction`, `Context Compaction`, `Package Runtime Configuration`, `Catalog Schemas`, `Image Attachments`, `Model Catalog Hook`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `scripts` connect `NPM Scripts` to `Package Runtime Configuration`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 25 inferred relationships involving `createConversationRepository()` (e.g. with `beginCompaction()` and `clear()`) actually correct?**
  _`createConversationRepository()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _384 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Endpoint Domain Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.050580997949419004 - nodes in this community are weakly interconnected._
- **Should `Settings and Data Cleanup` be split into smaller, more focused modules?**
  _Cohesion score 0.06384180790960452 - nodes in this community are weakly interconnected._