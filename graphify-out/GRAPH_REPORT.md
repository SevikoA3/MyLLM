# Graph Report - myllm  (2026-09-25)

## Corpus Check
- 155 files · ~123,422 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .ttf 1)

## Summary
- 1267 nodes · 2788 edges · 75 communities (60 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 64 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Conversation Repository
- Settings and Data Cleanup
- Tool Policy and Validation
- Chat Screen and Usage
- Model Detail Overrides
- Context Compaction
- Chat Tools and Gateway
- Expo Runtime Dependencies
- Endpoint HTTP and Usage
- Chat Completions Transport
- Responses API Transport
- Package Runtime Configuration
- Catalog File Storage Tests
- Android App Configuration
- Node Contract Tests
- Protocol Routing
- Chat Hook Tests
- Fake OpenAI Server
- Catalog Schemas
- NPM Scripts
- Model Catalog UI
- Model Parsing and Types
- Catalog Merge Logic
- Project Governance
- Usage and Endpoint Hooks
- Catalog File Assets
- Endpoint Store
- Catalog Repository
- App Routing and Bootstrap
- Model Catalog Hook
- Credentials and Onboarding
- Shared UI Theme
- Endpoint Domain Schema
- Setup Screen
- Image Attachments
- Chat State
- History Screens
- Conversation Export Schema
- Image Storage
- Test Build Scripts
- Error Redaction
- Endpoint Management Logic
- Conversation Transfer
- Development Tooling Dependencies
- Model JSON Editor UI
- SSE Parser
- TypeScript Configuration
- Conversation Contract Tests
- Model Smoke Test
- Model Catalog Hook Tests
- Endpoint Field Inspection
- Endpoint Management Screen
- ESLint Configuration
- Conversation Persistence Types
- Model JSON Transfer
- Onboarding Unit Tests
- Phase Two Exit Gate
- Metro NativeWind Configuration
- Model Fields Contract
- Onboarding Contract Test
- Jest Configuration
- App Identity
- Technical Research
- Product Design Direction
- NativeWind Types
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
  tools/onboarding.test.mjs → src/services/transport/models.ts
- `Local Execution Limits` --semantically_similar_to--> `Executor Contract`  [INFERRED] [semantically similar]
  AGENTS.md → PLAN.md
- `Layer Dependency Direction` --semantically_similar_to--> `Repository Architecture`  [INFERRED] [semantically similar]
  AGENTS.md → PLAN.md
- `EntryScreen()` --calls--> `useActiveEndpoint()`  [EXTRACTED]
  app/index.tsx → src/features/setup/use-active-endpoint.ts
- `remove()` --indirect_call--> `deleteStagedImages()`  [INFERRED]
  app/settings/endpoints.tsx → src/services/attachments/images.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sequential MVP Delivery** — plan_document_phase_1, plan_document_phase_2, plan_document_phase_3, plan_document_phase_4, plan_document_phase_5, plan_document_phase_6, plan_document_phase_7, plan_document_phase_8, plan_document_phase_9 [EXTRACTED 1.00]

## Communities (75 total, 15 thin omitted)

### Community 0 - "Conversation Repository"
Cohesion: 0.07
Nodes (70): expo-sqlite, orphanedImageAttachments(), redactRecord(), redactText(), buildTurnMetrics(), duration(), isRecord(), normalizeUsage() (+62 more)

### Community 1 - "Settings and Data Cleanup"
Cohesion: 0.06
Nodes (41): cardStyle, colors, fonts, SettingsScreen(), clearData(), exportDiagnostics(), saveWebTools(), selectWebSearchProvider() (+33 more)

### Community 2 - "Tool Policy and Validation"
Cohesion: 0.07
Nodes (45): DEFAULT_TOOL_POLICY, parseToolArguments(), requiresApproval(), StoredToolCall, readOnly, TOOL_APPROVALS, TOOL_RISKS, ToolActivity (+37 more)

### Community 3 - "Chat Screen and Usage"
Cohesion: 0.06
Nodes (32): react-native-markdown-display, ContextBudgetResult, contextPolicy, DEFAULT_CONTEXT_POLICY, formatCount(), formatDuration(), formatPercent(), formatRate() (+24 more)

### Community 4 - "Model Detail Overrides"
Cohesion: 0.07
Nodes (25): MergedModel, ModelOverrideSchema, CapabilityState, effectiveMaxOutput(), modelRequestSnapshot, protocolOutputCap(), reasoningChoices(), arrayText() (+17 more)

### Community 5 - "Context Compaction"
Cohesion: 0.08
Nodes (38): buildCompactedContext(), buildCompactionPrompt(), COMPACTION_PROMPT_VERSION, CompactionSelection, CompactionSummary, CompactionSummarySchema, CompactionTurn, parseCompactionSummary() (+30 more)

### Community 6 - "Chat Tools and Gateway"
Cohesion: 0.08
Nodes (38): testGateway(), ToolExecutionError, ToolExecutor, isRecord(), isWebUrl(), MAX_WEB_FETCH_OUTPUT_BYTES, MAX_WEB_SEARCH_COUNT, MAX_WEB_SEARCH_OUTPUT_BYTES (+30 more)

### Community 7 - "Expo Runtime Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, expo, expo-constants, expo-document-picker, expo-file-system, expo-font, @expo-google-fonts/inter, @expo-google-fonts/jetbrains-mono (+26 more)

### Community 8 - "Endpoint HTTP and Usage"
Cohesion: 0.12
Nodes (27): buildAuthHeaders(), buildCustomHeaders(), joinEndpointPath(), bodyTooLargeError(), fromNetworkError(), parseModelList(), ENRICHED_MODELS, STANDARD_MODELS (+19 more)

### Community 9 - "Chat Completions Transport"
Cohesion: 0.13
Nodes (28): expo, buildSystemPrompt(), SYSTEM_PROMPT_VERSION, AttemptMeta, AttemptResult, buildChatCompletionsBody(), cancelledError(), CHAT_COMPLETIONS_TIMEOUT_MS (+20 more)

### Community 10 - "Responses API Transport"
Cohesion: 0.14
Nodes (28): imageDataUrl(), AttemptMeta, AttemptResult, buildResponsesBody(), cancelledError(), emit(), emptyToolCall(), fail() (+20 more)

### Community 11 - "Package Runtime Configuration"
Cohesion: 0.07
Nodes (27): main, name, overrides, lightningcss, private, version, expo-constants, expo-image-picker (+19 more)

### Community 12 - "Catalog File Storage Tests"
Cohesion: 0.11
Nodes (11): save(), fileCatalogStorage, assertPath(), document(), joinPath(), mockCalls, MockDirectory, MockFile (+3 more)

### Community 13 - "Android App Configuration"
Cohesion: 0.08
Nodes (24): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, allowBackup, package, versionCode (+16 more)

### Community 14 - "Node Contract Tests"
Cohesion: 0.12
Nodes (14): ref_node_assert, ref_node_child_process, ref_node_http, ref_node_test, input, HEADERS, input, input (+6 more)

### Community 15 - "Protocol Routing"
Cohesion: 0.11
Nodes (23): EndpointProfile, ToolDefinition, chatCompletionsTransport, PartialStreamResponse, ResponseStreamEvent, SendResponseInput, SendResponseMeta, SendResponseOptions (+15 more)

### Community 16 - "Chat Hook Tests"
Cohesion: 0.08
Nodes (21): mockCredentialRead, mockDeleteStagedImages, mockDeleteUnreferencedStagedImages, mockFinishTurn, mockFlushAssistant, mockInputModalities, mockLoadConversation, mockLoadImageAttachments (+13 more)

### Community 17 - "Fake OpenAI Server"
Cohesion: 0.14
Nodes (21): authMode(), chatStream(), chatToolStream(), chatUsage(), checkAuth(), completed(), ENRICHED_MODELS, event() (+13 more)

### Community 18 - "Catalog Schemas"
Cohesion: 0.10
Nodes (21): CapabilityOverridesSchema, CapabilityStateSchema, CatalogModelFieldsSchema, CatalogSnapshot, CatalogSnapshotSchema, finitePositiveInt, HistoryModelsFile, HistoryModelsFileSchema (+13 more)

### Community 19 - "NPM Scripts"
Cohesion: 0.09
Nodes (22): scripts, android, doctor, ios, lint, smoke:models, smoke:responses, start (+14 more)

### Community 20 - "Model Catalog UI"
Cohesion: 0.14
Nodes (12): describeRefresh(), formatTokens(), modelBadges(), shortTime(), BadgeTone, capabilityValue(), cardStyle, colors (+4 more)

### Community 21 - "Model Parsing and Types"
Cohesion: 0.15
Nodes (18): zod, CatalogDefaults, InputModality, InputModalitySchema, EnrichedModelFieldsSchema, inferVendor(), MODALITIES, ModelParseResult (+10 more)

### Community 22 - "Catalog Merge Logic"
Cohesion: 0.16
Nodes (19): CatalogModelFields, HistoryModelEntry, CapabilityStateValue, CATALOG_SOURCES, CatalogSource, collect(), contextPolicyValue(), inferVendor() (+11 more)

### Community 23 - "Project Governance"
Cohesion: 0.11
Nodes (20): Repository Agent Instructions, Layer Dependency Direction, Local Execution Limits, Credential and Secret Protection, Source Document Requirements, Required Verification, MyLLM Implementation Plan, Repository Architecture (+12 more)

### Community 24 - "Usage and Endpoint Hooks"
Cohesion: 0.15
Nodes (13): colors, fonts, UsageScreen(), expo-status-bar, react, @testing-library/react-native, ModelsScreen(), ActiveEndpointState (+5 more)

### Community 25 - "Catalog File Assets"
Cohesion: 0.15
Nodes (17): assets_model_defaults, CatalogDefaultsSchema, catalogDirectory(), deleteCatalogForEndpoint(), file(), backupFileName(), CATALOG_DIR, CatalogStorage (+9 more)

### Community 26 - "Endpoint Store"
Cohesion: 0.14
Nodes (13): ConcreteProtocol, ConcreteProtocolSchema, EndpointProfileSchema, createEndpointStore(), loadAll(), resolve(), KeyValueStore, listeners (+5 more)

### Community 27 - "Catalog Repository"
Cohesion: 0.23
Nodes (20): changedOverrideModelIds(), serializeModelOverrides(), createCatalogRepository(), applyOverrides(), applyOverridesText(), load(), previewOverrides(), readHistory() (+12 more)

### Community 28 - "App Routing and Bootstrap"
Cohesion: 0.12
Nodes (12): colors, EntryScreen(), fonts, colors, global, expo-font, @expo-google-fonts/inter, @expo-google-fonts/jetbrains-mono (+4 more)

### Community 29 - "Model Catalog Hook"
Cohesion: 0.15
Nodes (16): ModelOverride, ModelCatalogState, bytesToBase64(), CatalogCache, CatalogRepository, CatalogRepositoryDeps, CatalogRuntime, defaultSnapshot() (+8 more)

### Community 30 - "Credentials and Onboarding"
Cohesion: 0.17
Nodes (11): expo-secure-store, connectAndDiscover(), newCredentialId(), OnboardDeps, OnboardResult, createCredentialStore(), resolve(), credentialStore (+3 more)

### Community 31 - "Shared UI Theme"
Cohesion: 0.20
Nodes (14): react-native, InfoBlock(), LinkCard(), PlaceholderScreen(), PrimaryButton(), Screen(), tonePalette(), dark (+6 more)

### Community 32 - "Endpoint Domain Schema"
Cohesion: 0.18
Nodes (16): AuthMode, BLOCKED_HEADERS, createEndpointProfile(), EndpointExportSchema, EndpointId, EndpointIdSchema, isDevelopment(), isLoopback() (+8 more)

### Community 33 - "Setup Screen"
Cohesion: 0.18
Nodes (13): cardStyle, colors, Edits, fonts, SetupScreen(), onConnect(), AuthModeSchema, ProtocolModeSchema (+5 more)

### Community 34 - "Image Attachments"
Cohesion: 0.15
Nodes (12): IMAGE_ATTACHMENT_ERROR_COPY, IMAGE_MIME_TYPES, ImageAttachment, ImageAttachmentSchema, ImageMimeTypeSchema, MAX_IMAGE_ATTACHMENTS, MAX_IMAGE_BYTES, MAX_MESSAGE_IMAGE_BYTES (+4 more)

### Community 35 - "Chat State"
Cohesion: 0.24
Nodes (16): createAppError(), ChatState, contextBudgetFor(), contextHardStopError(), localRequestError(), message(), missingCredentialError(), modelConfigError() (+8 more)

### Community 36 - "History Screens"
Cohesion: 0.15
Nodes (5): ConversationCursor, colors, fonts, HistoryRow, historyStatus

### Community 37 - "Conversation Export Schema"
Cohesion: 0.16
Nodes (12): CONVERSATION_EXPORT_SCHEMA_VERSION, ConversationExportSchema, ExportCompaction, ExportCompactionSchema, ExportToolCall, ExportToolCallSchema, ExportTurn, ExportTurnSchema (+4 more)

### Community 38 - "Image Storage"
Cohesion: 0.21
Nodes (10): ImageAttachmentRejection, deleteStagedImages(), deleteUnreferencedStagedImages(), directory(), extension(), ImagePickerResolver, newId(), stageImageAttachment() (+2 more)

### Community 39 - "Test Build Scripts"
Cohesion: 0.17
Nodes (8): ref_node_fs, ref_node_path, ENTRIES, STUBS, walk(), env, profile, root

### Community 40 - "Error Redaction"
Cohesion: 0.26
Nodes (10): AppError, AppErrorInput, appErrorToDiagnostic(), categorizeHttpStatus(), ErrorCategory, fromHttpResponse(), isRecord(), parseProviderErrorBody() (+2 more)

### Community 41 - "Endpoint Management Logic"
Cohesion: 0.24
Nodes (10): EndpointProfilesScreen(), exportProfiles(), importProfiles(), load(), remove(), select(), parseEndpointExport(), serializeEndpointExport() (+2 more)

### Community 42 - "Conversation Transfer"
Cohesion: 0.24
Nodes (11): expo-document-picker, expo-sharing, ConversationExport, makeExportFilename(), EndpointExport, HistoryScreen(), pickConversation(), pickJson() (+3 more)

### Community 43 - "Development Tooling Dependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-expo, lightningcss, postcss, tailwindcss, @tailwindcss/postcss, @testing-library/react-native (+3 more)

### Community 44 - "Model JSON Editor UI"
Cohesion: 0.22
Nodes (3): colors, fonts, OverridesPreview

### Community 45 - "SSE Parser"
Cohesion: 0.33
Nodes (7): createSseParser(), dispatch(), drain(), line(), SseFrame, SseParseResult, encoder

### Community 46 - "TypeScript Configuration"
Cohesion: 0.25
Nodes (7): expo/tsconfig.base, compilerOptions, paths, strict, types, extends, include

### Community 47 - "Conversation Contract Tests"
Cohesion: 0.29
Nodes (4): ref_node_os, ref_node_sqlite, adapter(), setup()

### Community 48 - "Model Smoke Test"
Cohesion: 0.25
Nodes (6): ref_node_url, env, files, profile, repository, root

### Community 49 - "Model Catalog Hook Tests"
Cohesion: 0.29
Nodes (7): mockCounter, mockFiles, mockResponder, MODEL, profile, setup(), useModelCatalog()

### Community 50 - "Endpoint Field Inspection"
Cohesion: 0.25
Nodes (5): env, keys, missing, root, types

### Community 51 - "Endpoint Management Screen"
Cohesion: 0.29
Nodes (4): colors, DeleteTarget, fonts, conversationRepository

### Community 52 - "ESLint Configuration"
Cohesion: 0.29
Nodes (6): { defineConfig }, expoConfig, globals, eslint, eslint-config-expo, ref_globals

### Community 53 - "Conversation Persistence Types"
Cohesion: 0.33
Nodes (5): ChatMessage, ConversationInputMessage, ConversationSummary, titleFromPrompt(), TurnStatus

### Community 54 - "Model JSON Transfer"
Cohesion: 0.47
Nodes (5): ModelsJsonScreen(), exportFile(), importFile(), pickOverridesJson(), shareOverridesJson()

### Community 56 - "Phase Two Exit Gate"
Cohesion: 0.33
Nodes (5): keyValueStore, kv, secure, secureStore, server

### Community 57 - "Metro NativeWind Configuration"
Cohesion: 0.40
Nodes (4): config, { getDefaultConfig }, { withNativewind }, nativewind

### Community 58 - "Model Fields Contract"
Cohesion: 0.40
Nodes (3): CAMPAIGN, FLASH, GLM

### Community 60 - "Jest Configuration"
Cohesion: 0.50
Nodes (4): jest, modulePathIgnorePatterns, preset, transformIgnorePatterns

### Community 62 - "Technical Research"
Cohesion: 0.67
Nodes (3): AmanAI Reference Profile, React Native Android LLM Client Research, Protocol Auto Routing

## Knowledge Gaps
- **381 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+376 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 512 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `directory()` connect `Image Storage` to `Conversation Contract Tests`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Expo Runtime Dependencies` to `Package Runtime Configuration`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `zod` connect `Model Parsing and Types` to `Endpoint Domain Schema`, `Settings and Data Cleanup`, `Image Attachments`, `Conversation Export Schema`, `Context Compaction`, `Package Runtime Configuration`, `Catalog Schemas`, `Model Catalog Hook`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 25 inferred relationships involving `createConversationRepository()` (e.g. with `beginCompaction()` and `clear()`) actually correct?**
  _`createConversationRepository()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _381 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Conversation Repository` be split into smaller, more focused modules?**
  _Cohesion score 0.0669710806697108 - nodes in this community are weakly interconnected._
- **Should `Settings and Data Cleanup` be split into smaller, more focused modules?**
  _Cohesion score 0.06384180790960452 - nodes in this community are weakly interconnected._