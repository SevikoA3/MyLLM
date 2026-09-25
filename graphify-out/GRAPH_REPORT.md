# Graph Report - myllm  (2026-09-25)

## Corpus Check
- 150 files · ~124,682 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .ttf 1)

## Summary
- 1272 nodes · 2878 edges · 71 communities (59 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0bcbc893`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- endpoint-store.ts
- settings/index.tsx
- catalog-transfer.ts
- chat-screen.tsx
- agent-loop.ts
- gateway.ts
- model-detail-screen.tsx
- responses.ts
- dependencies
- history-screen.tsx
- models.ts
- local-compaction.ts
- package.json
- catalog.ts
- catalog-files.test.ts
- expo
- ref_node_assert
- conversation-store.ts
- chat-completions.ts
- model-list.ts
- use-chat.test.tsx
- fake-oai-server.mjs
- models-screen.tsx
- catalog-files.ts
- scripts
- catalog-merge.ts
- use-chat.ts
- createCatalogRepository
- endpoints.tsx
- react-native
- attachment.ts
- catalog-store.ts
- error.ts
- domain/usage.ts
- store.ts
- context.ts
- protocol.ts
- AGENTS.md
- EndpointProfile
- images.ts
- smoke-responses.mjs
- devDependencies
- local-compaction.test.ts
- setup.tsx
- Phase 2 Endpoint Onboarding and Secure Credentials
- createSseParser
- useModelCatalog
- tsconfig.json
- conversations.test.mjs
- smoke-models.mjs
- Endpoint Field Inspection
- context-pill.tsx
- exit-gate.mjs
- onboarding.ts
- endpoint.ts
- MyLLM Implementation Plan
- model-fields.test.mjs
- onboarding.test.mjs
- app-info.ts
- readResponseText
- React Native Android LLM Client Research
- nativewind-env.d.ts
- Android Icon Background Safe Zone Template
- MyLLM Android App Icon
- Monochrome Android Icon
- Blue Chevron App Icon
- MyLLM App Icon
- Globe Grid Splash Icon

## God Nodes (most connected - your core abstractions)
1. `createConversationRepository()` - 38 edges
2. `createAppError()` - 31 edges
3. `useChat()` - 27 edges
4. `initialize()` - 25 edges
5. `EndpointProfile` - 23 edges
6. `scripts` - 22 edges
7. `createEndpointProfile()` - 22 edges
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
- `setup()` --calls--> `useChat()`  [EXTRACTED]
  test/features/chat/use-chat.test.tsx → src/features/chat/use-chat.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Phase Delivery Controls** — agents_phase_execution, agents_exit_gate, agents_test_requirements, agents_graph_refresh [EXTRACTED 1.00]
- **Sequential MVP Delivery** — plan_document_phase_1, plan_document_phase_2, plan_document_phase_3, plan_document_phase_4, plan_document_phase_5, plan_document_phase_6, plan_document_phase_7, plan_document_phase_8, plan_document_phase_9 [EXTRACTED 1.00]

## Communities (71 total, 12 thin omitted)

### Community 0 - "endpoint-store.ts"
Cohesion: 0.13
Nodes (14): ConcreteProtocol, ConcreteProtocolSchema, EndpointProfileSchema, createEndpointStore(), loadAll(), resolve(), endpointStore, KeyValueStore (+6 more)

### Community 1 - "settings/index.tsx"
Cohesion: 0.06
Nodes (42): cardStyle, SettingsScreen(), clearData(), exportDiagnostics(), saveWebTools(), selectWebSearchProvider(), expo-file-system, normalizeBaseUrl() (+34 more)

### Community 2 - "catalog-transfer.ts"
Cohesion: 0.08
Nodes (38): EndpointProfilesScreen(), exportProfiles(), importProfiles(), load(), remove(), select(), expo-document-picker, expo-sharing (+30 more)

### Community 3 - "chat-screen.tsx"
Cohesion: 0.11
Nodes (13): react-native-markdown-display, chatListStyle, EMPTY_MODELS, EndpointSelector(), MARKDOWN_STYLE, MessageBubble, PendingMessage(), ReasoningSelector() (+5 more)

### Community 4 - "agent-loop.ts"
Cohesion: 0.06
Nodes (52): DEFAULT_TOOL_POLICY, parseToolArguments(), requiresApproval(), StoredToolCall, TOOL_APPROVALS, TOOL_RISKS, ToolActivity, ToolApproval (+44 more)

### Community 5 - "gateway.ts"
Cohesion: 0.07
Nodes (42): testGateway(), config, { getDefaultConfig }, { withNativewind }, expo, nativewind, ToolExecutionError, isRecord() (+34 more)

### Community 6 - "model-detail-screen.tsx"
Cohesion: 0.08
Nodes (22): CatalogSource, MergedModel, effectiveMaxOutput(), modelRequestSnapshot, protocolOutputCap(), reasoningChoices(), arrayText(), buildOverride() (+14 more)

### Community 7 - "responses.ts"
Cohesion: 0.14
Nodes (29): imageDataUrl(), AttemptMeta, AttemptResult, buildResponsesBody(), cancelledError(), emit(), emptyToolCall(), fail() (+21 more)

### Community 8 - "dependencies"
Cohesion: 0.06
Nodes (34): dependencies, expo, expo-constants, expo-document-picker, expo-file-system, expo-font, @expo-google-fonts/inter, @expo-google-fonts/jetbrains-mono (+26 more)

### Community 9 - "history-screen.tsx"
Cohesion: 0.14
Nodes (7): ChatMessage, ConversationCursor, ConversationSummary, titleFromPrompt(), TurnStatus, HistoryRow, historyStatus

### Community 10 - "models.ts"
Cohesion: 0.16
Nodes (22): buildAuthHeaders(), buildCustomHeaders(), joinEndpointPath(), bodyTooLargeError(), fromNetworkError(), parseModelList(), createWebGatewayClient(), chatCompletionsUrl() (+14 more)

### Community 11 - "local-compaction.ts"
Cohesion: 0.14
Nodes (20): buildCompactedContext(), buildCompactionPrompt(), COMPACTION_PROMPT_VERSION, CompactionSelection, CompactionSummary, CompactionSummarySchema, CompactionTurn, selectCompactionPrefix() (+12 more)

### Community 12 - "package.json"
Cohesion: 0.05
Nodes (38): { defineConfig }, expoConfig, globals, jest, modulePathIgnorePatterns, preset, roots, transformIgnorePatterns (+30 more)

### Community 13 - "catalog.ts"
Cohesion: 0.11
Nodes (20): CapabilityOverridesSchema, CapabilityStateSchema, CatalogModelFieldsSchema, CatalogSnapshot, CatalogSnapshotSchema, finitePositiveInt, HistoryModelsFile, HistoryModelsFileSchema (+12 more)

### Community 14 - "catalog-files.test.ts"
Cohesion: 0.11
Nodes (11): save(), fileCatalogStorage, assertPath(), document(), joinPath(), mockCalls, MockDirectory, MockFile (+3 more)

### Community 15 - "expo"
Cohesion: 0.08
Nodes (24): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, allowBackup, package, versionCode (+16 more)

### Community 16 - "ref_node_assert"
Cohesion: 0.12
Nodes (14): ref_node_assert, ref_node_child_process, ref_node_http, ref_node_test, input, HEADERS, input, input (+6 more)

### Community 17 - "conversation-store.ts"
Cohesion: 0.07
Nodes (66): expo-sqlite, orphanedImageAttachments(), parseCompactionSummary(), buildTurnMetrics(), duration(), normalizeUsage(), activeCompaction(), CompactionRow (+58 more)

### Community 18 - "chat-completions.ts"
Cohesion: 0.14
Nodes (27): buildSystemPrompt(), SYSTEM_PROMPT_VERSION, AttemptMeta, AttemptResult, buildChatCompletionsBody(), cancelledError(), CHAT_COMPLETIONS_TIMEOUT_MS, chatCompletionsClient (+19 more)

### Community 19 - "model-list.ts"
Cohesion: 0.11
Nodes (22): zod, CatalogDefaults, CapabilityState, InputModality, InputModalitySchema, EnrichedModelFieldsSchema, inferVendor(), MODALITIES (+14 more)

### Community 20 - "use-chat.test.tsx"
Cohesion: 0.08
Nodes (22): mockCredentialRead, mockDeleteStagedImages, mockDeleteUnreferencedStagedImages, mockFinishTurn, mockFlushAssistant, mockInputModalities, mockLoadConversation, mockLoadImageAttachments (+14 more)

### Community 21 - "fake-oai-server.mjs"
Cohesion: 0.14
Nodes (21): authMode(), chatStream(), chatToolStream(), chatUsage(), checkAuth(), completed(), ENRICHED_MODELS, event() (+13 more)

### Community 22 - "models-screen.tsx"
Cohesion: 0.14
Nodes (13): ModelSelector(), describeRefresh(), formatTokens(), modelBadges(), modelPickerName(), shortTime(), BadgeTone, capabilityValue() (+5 more)

### Community 23 - "catalog-files.ts"
Cohesion: 0.16
Nodes (16): assets_model_defaults, CatalogDefaultsSchema, catalogDirectory(), deleteCatalogForEndpoint(), file(), backupFileName(), CATALOG_DIR, modelsPathOf() (+8 more)

### Community 24 - "scripts"
Cohesion: 0.09
Nodes (22): scripts, android, doctor, ios, lint, smoke:models, smoke:responses, start (+14 more)

### Community 25 - "catalog-merge.ts"
Cohesion: 0.17
Nodes (18): CatalogModelFields, HistoryModelEntry, CapabilityStateValue, CATALOG_SOURCES, collect(), contextPolicyValue(), inferVendor(), isRecord() (+10 more)

### Community 26 - "use-chat.ts"
Cohesion: 0.23
Nodes (17): createAppError(), ChatState, contextBudgetFor(), contextHardStopError(), localRequestError(), message(), missingCredentialError(), modelConfigError() (+9 more)

### Community 27 - "createCatalogRepository"
Cohesion: 0.21
Nodes (21): changedOverrideModelIds(), serializeModelOverrides(), createCatalogRepository(), applyOverrides(), applyOverridesText(), load(), previewOverrides(), readHistory() (+13 more)

### Community 28 - "endpoints.tsx"
Cohesion: 0.07
Nodes (22): DeleteTarget, global, expo-font, @expo-google-fonts/inter, @expo-google-fonts/jetbrains-mono, expo-router, expo-symbols, expo-system-ui (+14 more)

### Community 29 - "react-native"
Cohesion: 0.32
Nodes (9): react-native, InfoBlock(), LinkCard(), PlaceholderScreen(), PrimaryButton(), Screen(), tonePalette(), ThemeColors (+1 more)

### Community 30 - "attachment.ts"
Cohesion: 0.14
Nodes (11): IMAGE_ATTACHMENT_ERROR_COPY, IMAGE_MIME_TYPES, ImageAttachment, ImageAttachmentRejection, ImageAttachmentSchema, ImageMimeTypeSchema, MAX_IMAGE_ATTACHMENTS, MAX_IMAGE_BYTES (+3 more)

### Community 31 - "catalog-store.ts"
Cohesion: 0.13
Nodes (18): ModelOverride, ModelOverridesFileSchema, OverrideValidationFailure, ModelCatalogState, bytesToBase64(), CatalogCache, CatalogRepository, CatalogRepositoryDeps (+10 more)

### Community 32 - "error.ts"
Cohesion: 0.26
Nodes (10): AppError, AppErrorInput, appErrorToDiagnostic(), categorizeHttpStatus(), ErrorCategory, fromHttpResponse(), isRecord(), parseProviderErrorBody() (+2 more)

### Community 33 - "domain/usage.ts"
Cohesion: 0.24
Nodes (9): isRecord(), MetricsSummary, NormalizedUsage, numberAt(), sumKnown(), summarizeMetrics(), TurnMetrics, UsageQuality (+1 more)

### Community 34 - "store.ts"
Cohesion: 0.24
Nodes (6): expo-secure-store, createCredentialStore(), resolve(), credentialStore, nativeSecureStore(), SecureStoreLike

### Community 35 - "context.ts"
Cohesion: 0.24
Nodes (12): APP_AUTO_OUTPUT_BUDGET, buildContextBudget(), clampPercent(), CONTEXT_ITEM_OVERHEAD_TOKENS, CONTEXT_MAX_SAFETY_MARGIN, CONTEXT_MIN_SAFETY_MARGIN, CONTEXT_TOKEN_BYTES_DIVISOR, ContextBudgetInput (+4 more)

### Community 36 - "protocol.ts"
Cohesion: 0.17
Nodes (15): chatCompletionsTransport, ResponseStreamEvent, createProtocolTransport(), send(), FALLBACK_STATUSES, isProtocolFallbackError(), loadCached(), opposite() (+7 more)

### Community 37 - "AGENTS.md"
Cohesion: 0.18
Nodes (12): DESIGN.md, Phase Exit Gate, Graph Refresh Workflow, graphify-out/graph.json, Layered Architecture, No Expo or Android Builds by Agent, Sequential Phase Execution, PLAN.md (+4 more)

### Community 38 - "EndpointProfile"
Cohesion: 0.17
Nodes (12): EntryScreen(), UsageScreen(), expo-status-bar, react, @testing-library/react-native, EndpointProfile, ChatScreen(), ActiveEndpointState (+4 more)

### Community 39 - "images.ts"
Cohesion: 0.26
Nodes (9): validateImageAttachment(), validateImageAttachmentSet(), directory(), extension(), ImagePickerResolver, newId(), stageImageAttachment(), mockLaunch (+1 more)

### Community 40 - "smoke-responses.mjs"
Cohesion: 0.17
Nodes (8): ref_node_fs, ref_node_path, ENTRIES, STUBS, walk(), env, profile, root

### Community 41 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-expo, lightningcss, postcss, tailwindcss, @tailwindcss/postcss, @testing-library/react-native (+3 more)

### Community 42 - "local-compaction.test.ts"
Cohesion: 0.20
Nodes (8): BeginCompactionInput, CompactionSource, CompleteCompactionInput, SendResponseInput, client(), profile, response(), summary

### Community 43 - "setup.tsx"
Cohesion: 0.24
Nodes (12): cardStyle, Edits, SetupScreen(), onConnect(), validateBaseUrl(), describe(), ErrorCopy, FALLBACK (+4 more)

### Community 44 - "Phase 2 Endpoint Onboarding and Secure Credentials"
Cohesion: 0.22
Nodes (9): Phase 1 Domain Contracts and Fake Endpoint, Phase 2 Endpoint Onboarding and Secure Credentials, Phase 3 Model Catalog and Picker, Phase 4 Non-stream Chat, Phase 5 Responses Streaming and Cancellation, Phase 6 SQLite Conversation History and Recovery, Phase 7 Model Controls and Editable JSON, Phase 8 Usage Normalization and Metrics (+1 more)

### Community 45 - "createSseParser"
Cohesion: 0.33
Nodes (7): createSseParser(), dispatch(), drain(), line(), SseFrame, SseParseResult, encoder

### Community 46 - "useModelCatalog"
Cohesion: 0.29
Nodes (7): useModelCatalog(), mockCounter, mockFiles, mockResponder, MODEL, profile, setup()

### Community 47 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): expo/tsconfig.base, compilerOptions, paths, strict, types, extends, include

### Community 48 - "conversations.test.mjs"
Cohesion: 0.29
Nodes (4): ref_node_os, ref_node_sqlite, adapter(), setup()

### Community 49 - "smoke-models.mjs"
Cohesion: 0.25
Nodes (6): ref_node_url, env, files, profile, repository, root

### Community 50 - "Endpoint Field Inspection"
Cohesion: 0.25
Nodes (5): env, keys, missing, root, types

### Community 51 - "context-pill.tsx"
Cohesion: 0.20
Nodes (10): ContextBudgetResult, contextPolicy, formatCount(), formatDuration(), formatPercent(), formatRate(), contextColor(), ContextGauge() (+2 more)

### Community 52 - "exit-gate.mjs"
Cohesion: 0.33
Nodes (5): keyValueStore, kv, secure, secureStore, server

### Community 53 - "onboarding.ts"
Cohesion: 0.17
Nodes (9): AuthMode, createEndpointProfile(), ProtocolMode, newCredentialId(), OnboardDeps, OnboardResult, profileFromInput(), SetupInput (+1 more)

### Community 54 - "endpoint.ts"
Cohesion: 0.19
Nodes (12): AuthModeSchema, BLOCKED_HEADERS, EndpointExportSchema, EndpointId, EndpointIdSchema, isDevelopment(), isLoopback(), isSecureProtocol() (+4 more)

### Community 55 - "MyLLM Implementation Plan"
Cohesion: 0.22
Nodes (7): Operational Android Interface, MyLLM Implementation Plan, Repository Architecture, Executor Contract, Product Defaults, Android LLM Client Product Goal, Development and Verification Workflow

### Community 56 - "model-fields.test.mjs"
Cohesion: 0.40
Nodes (3): CAMPAIGN, FLASH, GLM

### Community 59 - "readResponseText"
Cohesion: 0.60
Nodes (3): MAX_RESPONSE_BODY_BYTES, readResponseText(), ReadResponseTextResult

### Community 60 - "React Native Android LLM Client Research"
Cohesion: 0.67
Nodes (3): AmanAI Reference Profile, React Native Android LLM Client Research, Protocol Auto Routing

## Knowledge Gaps
- **366 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+361 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 501 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `zod` connect `model-list.ts` to `settings/index.tsx`, `catalog-transfer.ts`, `context.ts`, `local-compaction.ts`, `package.json`, `catalog.ts`, `endpoint.ts`, `attachment.ts`, `catalog-store.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 25 inferred relationships involving `createConversationRepository()` (e.g. with `beginCompaction()` and `clear()`) actually correct?**
  _`createConversationRepository()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _366 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `endpoint-store.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `settings/index.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0633879781420765 - nodes in this community are weakly interconnected._