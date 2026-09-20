# Peta Codebase MyLLM

Peta struktur folder, tanggung jawab file, dan dependency antar layer. Dipakai supaya executor dan agent tidak perlu membaca seluruh repository untuk menemukan tempat sebuah perubahan.

Status: Phase 15 implementation and automated checks completed 20 September 2026. Web search supports private gateway or direct Exa, and web fetch uses Firecrawl Keyless; image input is limited to declared Responses-capable models; Android endpoint and memory verification remain manual.

Cara memperbarui dokumen ini ada di bagian 35 PLAN.md.

## 1. Aturan baca

- Layer: `app` (routing) -> `src/features` (UI dan orkestrasi) -> `src/domain` (tipe dan pure logic), `src/services` (I/O), `src/ui` (token visual).
- Arah dependency hanya ke bawah: `app` boleh mengimpor `features`, `domain`, `services`, `ui`. `domain` tidak mengimpor layer lain. `services` boleh mengimpor `domain`. `features` boleh mengimpor semuanya kecuali `app`.
- Tidak ada barrel `index.ts`. Impor selalu menunjuk berkas konkret.
- Tidak ada folder `utils`. Helper tinggal di domain yang memakainya.
- Setiap berkas di `src` berpasangan dengan `*.test.ts` hanya jika perilakunya perlu dikunci. Berkas yang belum punya test ditandai `belum ada test`.

## 2. Struktur folder saat ini

~~~text
myllm/
  app/                              Expo Router, route saja, tanpa logic domain
    _layout.tsx                     stack root dan import global.css
    index.tsx                       gerbang redirect ke /setup atau /(tabs)
    setup.tsx                       form onboarding endpoint dan discover model
    history.tsx                     re-export layar history
    (tabs)/
      _layout.tsx                   four bottom tabs with native icons
      index.tsx                     re-export layar chat utama
      models.tsx                    re-export src/features/models/models-screen
      history.tsx                   re-export src/features/history/history-screen
      settings.tsx                  re-export app/settings/index.tsx
    settings/
      index.tsx                     settings, web gateway configuration, safe diagnostic export, and clear-all-data confirmation
      models.tsx                    re-export src/features/models/models-screen
      model.tsx                     re-export detail dan override satu model
      models-json.tsx               re-export editor JSON model override
    chat/
      [conversationId].tsx          re-export layar chat untuk conversation tersimpan atau new
  src/
    app-info.ts                     konstanta nama app dan application ID
    app-info.test.ts
    domain/                         tipe dan pure logic, tanpa I/O
      endpoint.ts                   EndpointProfile, protocol modes, normalisasi base URL, join path, header auth
      endpoint.test.ts
      error.ts                      AppError, kategori error, redaksi secret
      error.test.ts
      model.ts                      ModelRecord, kemampuan model, state unknown
      model-list.ts                 parse GET /models dan normalizer per record
      model-list.test.ts
      catalog.ts                    schema katalog tiga lapis, pricing, override
      catalog.test.ts
      catalog-merge.ts              merge bundled, live, override, history
      catalog-merge.test.ts
      model-config.ts               reasoning, protocol output cap, dan request config snapshot
      model-config.test.ts
      context.ts                    estimasi context budget preflight dan safety margin
      context.test.ts
      compaction.ts                 policy, selection, prompt, schema summary, dan effective context
      compaction.test.ts
      tool.ts                       tool definition, policy, validation, result, dan activity types
      tool.test.ts
      web-search.ts                 bounded web search/fetch output, source card parser, dan URL guard
      web-search.test.ts
      web-tools.ts                  schema setting gateway HTTPS dan normalisasi URL
      web-tools.test.ts
      attachment.ts                 allowlist, limit, dan lifecycle metadata attachment image
      attachment.test.ts
      conversation.ts               tipe message, status turn, summary, cursor, auto title
      conversation.test.ts
      usage.ts                      normalisasi usage provider, timing, cache bucket, dan metrics
      usage.test.ts
      sse.ts                        parser frame SSE incremental dan UTF-8 streaming
      sse.test.ts
      system-prompt.ts              system prompt v2 berdasarkan model ID exact dan untrusted web content
      system-prompt.test.ts
    features/                       UI dan orkestrasi per layar
      chat/
        chat-screen.tsx             message list, composer, inline tool-request bubbles with accordion results, web search/fetch source cards, streaming, retry, and context controls
        context-pill.tsx            textual context usage pill with modal details, cache hit, and auto-compact
        context-pill.test.tsx
        use-chat.ts                 state chat memory, context budget debounce, preflight local compaction, hard stop, toggle, metrics, stateless history replay, batching delta, cancellation, protocol request orchestration
        use-chat.test.tsx
        agent-loop.ts               bounded request-tool-result loop, approval, caps, timeout, cancellation, and dedupe
        agent-loop.test.ts
      history/
        history-screen.tsx          local console history, filter, inline rename, bottom-sheet delete, New chat
        history-screen.test.ts       mapping status conversation history
      setup/
        onboarding.ts               alur connect, discover, simpan profile dan credential
        onboarding.test.ts
        use-active-endpoint.ts      hook endpoint aktif dari kv-store
        error-copy.ts               teks error untuk pengguna
      models/
        models-screen.tsx           layar picker model
        models-screen.test.tsx
        model-detail-screen.tsx     inspection provenance, request control, local override form, dan reset sheet
        model-detail-screen.test.ts mapping label provenance katalog
        models-json-screen.tsx      editor, preview, import, dan export override JSON
        use-model-catalog.ts        hook runtime katalog dan refresh coalescing
        use-model-catalog.test.tsx
        catalog-seed.ts             tulis snapshot hasil discover pertama
        model-badges.ts             badge metadata dan ringkasan refresh
    services/                       I/O ke luar proses
      credentials/
        store.ts                    API key di Keystore dan registry credential untuk clear-all
        store.test.ts
      diagnostics/
        diagnostic-ring.ts         ring diagnostik lokal 2 MB tanpa content atau credential
        diagnostic-transfer.ts     export ring diagnostik aman melalui share sheet
      transport/
        models.ts                   GET /models dengan timeout dan tanpa redirect
        contract.ts                 canonical request, transport result, dan internal stream events
        responses.ts                POST /responses streaming, event mapping, timing, cancellation, retry, dan Retry-After
        chat-completions.ts         POST /chat/completions streaming, delta mapping, usage, tool fragments, dan retry
        protocol.ts                 explicit protocol selection, Auto fallback, protocol cache, dan reset support
        body.ts                     pembacaan response dengan cap 256 KB
        body.test.ts                test cap body response
      context/
        local-compaction.ts         local summary request, retry satu kali, validation, dan compaction usage
        local-compaction.test.ts
      tools/
        gateway.ts                  client gateway dan Exa untuk search, serta Firecrawl Keyless untuk fetch
        registry.ts                 app-owned get_current_time, web_search, dan web_fetch Firecrawl
        registry.test.ts
      attachments/
        image-input.ts              baca image staged menjadi data URL pada saat request Responses
        images.ts                   pilih dan stage image ke storage privat, cleanup orphan, dan clear-all
        images.test.ts
      persistence/
        conversation-store.ts       migration SQLite, history, tool audit, metrics, recovery, dan compaction
        endpoint-store.ts           profile endpoint dan activeModelId di kv-store
        endpoint-store.test.ts
        settings-store.ts           activeModelId untuk endpoint aktif
        catalog-store.ts            baca, tulis, backup snapshot katalog
        catalog-store.test.ts
        catalog-files.ts            implementasi CatalogStorage lewat expo-file-system
        catalog-files.test.ts
        catalog-transfer.ts         import document picker dan export share sheet
        clear-all.ts                orkestrasi penghapusan SQLite, credential, cache, dan diagnostic ring
        web-tools-store.ts          simpan URL dan enabled web tools tanpa bearer token
        web-tools-store.test.ts
    ui/
      tokens.ts                     spacing dan radius
      theme.ts                      warna light/dark dan token visual aktif
      components.tsx                komponen layar, tombol, kartu, dan info bersama
      components.test.tsx
  assets/
    model-defaults.json             katalog bundled, saat ini kosong
    images/                         ikon, splash, favicon
    fonts/                          SpaceMono-Regular
  tools/                            skrip Node di luar bundle aplikasi
    fake-oai-server.mjs             fake OpenAI-compatible endpoint
    fake-server.test.mjs
    build-tests.mjs                 kompilasi modul produksi ke .tests-build sebagai ESM
    transport.test.mjs              contract test transport discovery
    onboarding.test.mjs             smoke test connect dan discover
    responses.test.mjs              contract Responses API terhadap fake endpoint
    web-tools.test.mjs              contract private gateway health, search, dan fetch
    conversations.test.mjs          contract migration, cascade, recovery, pagination
    model-fields.test.mjs           contract bentuk field model AmanAI
    dump-endpoint-fields.mjs        inspeksi field GET /models tanpa mencetak secret
    smoke-models.mjs                refresh katalog nyata terhadap endpoint di .env
    smoke-responses.mjs             dua turn Responses API nyata tanpa mencetak isi pesan
    exit-gate.mjs                   bukti exit gate Phase 2
  docs/
    CODEBASE.md                     dokumen ini
  DESIGN.md                         arah visual produk untuk semua perubahan UI
  PLAN.md                           rencana fase dan kontrak executor
  RESEARCH_REACT_NATIVE_ANDROID_LLM_CLIENT.md
  README.md
~~~

Folder yang muncul di struktur target tetapi belum ada: `modules/`. Buat hanya saat fase pertama yang membutuhkannya.

## 3. Tanggung jawab berkas

### 3.1 app

| File | Tanggung jawab | Bergantung pada |
|---|---|---|
| `app/_layout.tsx` | Stack root, StatusBar, import `global.css` | expo-router |
| `app/index.tsx` | Redirect ke setup atau tabs berdasarkan endpoint aktif | `features/setup/use-active-endpoint` |
| `app/setup.tsx` | Form base URL, auth mode, dan API key; preview URL; panggil connect; tampilkan error | `domain/endpoint`, `features/setup/*`, `features/models/catalog-seed`, `services/transport/models`, `services/persistence/catalog-files` |
| `app/(tabs)/_layout.tsx` | Four bottom tabs: Chat, Catalog, History, Settings; design tokens and native icons | expo-router, expo-symbols |
| `app/(tabs)/index.tsx` | Re-export layar chat utama | `features/chat/chat-screen` |
| `app/(tabs)/models.tsx` | Re-export layar picker | `features/models/models-screen` |
| `app/(tabs)/history.tsx` | Re-export layar history untuk bottom tab | `features/history/history-screen` |
| `app/(tabs)/settings.tsx` | Re-export layar settings untuk bottom tab | `app/settings/index.tsx` |
| `app/settings/models.tsx` | Re-export layar picker | `features/models/models-screen` |
| `app/settings/model.tsx` | Re-export detail dan override model | `features/models/model-detail-screen` |
| `app/settings/models-json.tsx` | Re-export editor JSON override | `features/models/models-json-screen` |
| `app/settings/index.tsx` | Settings, web search provider choice, gateway URL/token or Exa API key, gateway health check, safe diagnostic export, and clear-all-data confirmation | `domain/web-tools`, `services/tools/gateway`, `services/persistence/*`, `services/credentials/store` |
| `app/history.tsx` | Re-export layar history | `features/history/history-screen` |
| `app/chat/[conversationId].tsx` | Re-export chat untuk membuka conversation tersimpan atau route `new` | `features/chat/chat-screen` |

Route hanya menyusun screen dan dependency. Logic tetap berada di `features`.

### 3.2 src/domain

| File | Isi | Catatan kontrak |
|---|---|---|
| `endpoint.ts` | `EndpointProfileSchema`, protocol modes, `createEndpointProfile`, `normalizeBaseUrl`, `joinEndpointPath`, `buildAuthHeaders`, `buildCustomHeaders`, `validateBaseUrl` | Cleartext HTTP hanya untuk host loopback pada build development. Profile tidak pernah menyimpan API key. |
| `error.ts` | `AppError`, `createAppError`, `redactText`, `categorizeHttpStatus`, `parseProviderErrorBody`, `fromHttpResponse`, `fromNetworkError`, `appErrorToDiagnostic` | Setiap pesan yang mungkin memuat secret melewati redaksi. |
| `model.ts` | `ModelRecord`, `ModelCapabilities`, `CapabilityState`, `UNKNOWN_CAPABILITIES` | Field hilang bernilai null atau unknown, bukan false atau nol. |
| `model-list.ts` | `parseModelList`, `normalizeModelRecord`, `OpenAiModelListSchema`, `EnrichedModelFieldsSchema` | Envelope divalidasi, elemen data loose, record rusak ditolak per record. |
| `catalog.ts` | Schema katalog, override, parser JSON, preview perubahan, serializer, dan pricing | Field yang tidak ada berarti inherit, null berarti hapus override. Schema future ditolak. |
| `catalog-merge.ts` | `mergeCatalog`, `MergedModel`, `ProvenanceMap`, `CATALOG_SOURCES` | Urutan menang: user-override, live, bundled. `enabled`, request setting, dan provenance dihitung di sini. |
| `model-config.ts` | `effectiveMaxOutput`, `reasoningChoices`, `modelRequestSnapshot`, `protocolOutputCap` | Memvalidasi effort, output limit, context policy, modality input, dan membuat config immutable sebelum request. |
| `context.ts` | `ContextPolicySchema`, default policy, `buildContextBudget` | Menghitung effective input termasuk perkiraan data URL image, output reserve, safety margin, occupancy, dan calibration hint tanpa I/O. |
| `compaction.ts` | `CompactionSummarySchema`, prefix selector, prompt, parser, `buildCompactedContext` | Menjaga summary sebagai data untrusted, attachment lama untuk replay, dan boundary turn tanpa menghapus transcript. |
| `tool.ts` | ToolDefinition, ToolCall, ToolResult, policy, JSON validation, dan activity states | Unknown tool menghasilkan structured error; write dan dangerous selalu butuh approval. |
| `web-search.ts` | WebSearchOutput, WebFetchOutput, URL guard, parser source card gateway, Exa, dan Firecrawl, serta cap output | Hanya URL HTTP(S) dapat masuk source card; seluruh output web ditandai untrusted. |
| `web-tools.ts` | WebToolsSettings, pilihan provider, dan normalisasi URL serta SearXNG engine private gateway | Gateway harus HTTPS, tanpa query atau fragment; enabled gateway memerlukan URL dan engine default `bing`. |
| `attachment.ts` | Schema, allowlist, limit, parser, dan error copy image attachment | PNG, JPEG, WebP; max 8 MB per image, 12 MB per message, dan empat image. |
| `conversation.ts` | `ChatMessage`, input history, attachment, status turn, summary, cursor, dan `titleFromPrompt` | Status mengunci sending, streaming, terminal, dan interrupted. |
| `usage.ts` | `NormalizedUsage`, `TurnMetrics`, normalisasi field Responses, cache bucket, TTFT, TPS, dan session summary | Field usage yang hilang tetap null; cached input tidak dijumlahkan ulang. |
| `sse.ts` | `createSseParser`, `SseFrame`, parser incremental `Uint8Array` dengan `TextDecoder` stream mode | Menangani LF, CRLF, comment, multiline data, event field, `[DONE]`, dan EOF. |
| `system-prompt.ts` | `buildSystemPrompt`, `SYSTEM_PROMPT_VERSION`, instruksi asisten MyLLM dan model ID exact | Model ID di-escape sebagai JSON string dan web content dinyatakan untrusted data. |

### 3.3 src/features

| File | Isi | Bergantung pada |
|---|---|---|
| `setup/onboarding.ts` | `connectAndDiscover`, `profileFromInput`, `suggestName`, `newCredentialId`, `loadCredentialFor` | `domain/endpoint`, `domain/error`, `services/credentials/store`, `services/transport/models`, `services/persistence/endpoint-store` |
| `setup/use-active-endpoint.ts` | `useActiveEndpoint` mengembalikan status loading atau ready | `services/persistence/endpoint-store` |
| `setup/error-copy.ts` | `describe`, `modelSummary`, `ErrorCopy` | `domain/error`, `domain/model` |
| `chat/chat-screen.tsx` | Dark operational chat shell, model and diagnostic bars, image composer/preview, inline tool-request bubbles with accordion results and per-call approval, web source cards, streaming, retry, dan context controls | `domain/conversation`, `domain/context`, `domain/tool`, `domain/usage`, `domain/web-search`, `features/chat/use-chat`, `features/setup/use-active-endpoint` |
| `chat/context-pill.tsx` | Context usage modal, cache hit, dan auto-compact | `domain/context`, `domain/usage` |
| `chat/use-chat.ts` | Orkestrasi conversation, declared image support, staging cleanup, compaction, model snapshot, persistence, metrics, cancellation, provider web search, tool policy, dan AgentLoop | Memuat audit tool per assistant message agar bubble transcript tetap ada setelah chat dibuka kembali. |
| `chat/agent-loop.ts` | Bounded model-tool loop, policy, approval callback, output cap, timeout, cancellation, dan dedupe | Tool dapat menetapkan timeout spesifik tanpa mengubah cap output global. |
| `history/history-screen.tsx` | History local console dengan keyset pagination, filter title/model/status, buka chat, rename, dan delete attachment orphan | `domain/conversation`, `services/attachments/images`, `services/persistence/conversation-store` |
| `history/history-screen.test.ts` | Mengunci mapping status conversation history | `history/history-screen` |
| `models/models-screen.tsx` | Layar picker: daftar, refresh, pilih model aktif, tambah model exact ID, dan tautan editor | `domain/catalog-merge`, `services/persistence/endpoint-store`, `features/setup/use-active-endpoint`, `models/model-badges`, `models/use-model-catalog` |
| `models/model-detail-screen.tsx` | Inspection console nilai efektif dan provenance, reasoning, output limit, metadata override, reset field dan model | `domain/catalog`, `domain/catalog-merge`, `domain/model-config`, `models/use-model-catalog` |
| `models/model-detail-screen.test.ts` | Mengunci label provenance katalog dan state unknown | `models/model-detail-screen` |
| `models/models-json-screen.tsx` | Raw JSON editor, validation path, preview model, import, export, dan save | `models/use-model-catalog`, `services/persistence/catalog-transfer`, `ui/*` |
| `models/use-model-catalog.ts` | `useModelCatalog` menyatukan refresh, model override, custom model, preview, replace JSON, dan export | `services/persistence/catalog-store`, `services/persistence/catalog-files`, `services/credentials/store`, `services/transport/models` |
| `models/catalog-seed.ts` | `seedCatalogCache` menulis snapshot setelah discover pertama | `services/persistence/catalog-store` |
| `models/model-badges.ts` | `modelBadges`, `formatTokens`, `describeRefresh` | `domain/catalog-merge` |

`models-screen.test.tsx` mengunci badge metadata dan state model. `use-model-catalog.test.tsx` mengunci refresh manual, metadata hasil normalisasi, dan last-known-good saat endpoint gagal.

### 3.4 src/services

| File | Isi | Bergantung pada |
|---|---|---|
| `credentials/store.ts` | `createCredentialStore` di atas `expo-secure-store`, prefix key `myllm.credential.`, registry untuk clear-all | API key provider, Exa, dan bearer token gateway disimpan lewat modul native lazy. |
| `transport/models.ts` | `discoverModels`, `modelsUrl`, timeout 15 detik, redirect tidak diikuti | `domain/endpoint`, `domain/error`, `domain/model-list` |
| `transport/contract.ts` | Canonical request, tool definition/exchange, internal stream events, normalized result metadata, and `Transport` contract | `domain/conversation`, `domain/endpoint`, `domain/error`, `domain/tool` |
| `transport/responses.ts` | `responsesTransport`, canonical input dan mapping `input_image` data URL, POST streaming, events, timing, retry, dan cancellation | `domain/attachment`, `domain/endpoint`, `domain/error`, `domain/sse`, `services/attachments/image-input`, `expo/fetch` |
| `transport/chat-completions.ts` | `chatCompletionsTransport`, canonical messages/tool mapping, configured output, reasoning, SSE delta, usage, timing, retry, and cancellation | `domain/endpoint`, `domain/error`, `domain/sse`, `domain/system-prompt`, `expo/fetch` |
| `transport/protocol.ts` | Explicit protocol routing, Auto Responses-first fallback for 404/405/501 before output, successful protocol cache, and diagnostic event forwarding | `transport/contract`, `transport/responses`, `transport/chat-completions`, `persistence/endpoint-store` |
| `persistence/endpoint-store.ts` | Profile, activeModelId, and per-endpoint protocol cache di `expo-sqlite/kv-store` | `domain/endpoint` |
| `persistence/settings-store.ts` | `loadActiveModelId` dan penulisan model aktif | `persistence/endpoint-store` |
| `persistence/catalog-store.ts` | `createCatalogRepository`, atomic snapshot dan override, preview/import, custom model, `loadModelRequestSnapshot`, dan `saveModelReasoningEffort` | `domain/catalog`, `domain/catalog-merge`, `domain/model-config`, `domain/endpoint` |
| `persistence/catalog-files.ts` | `fileCatalogStorage`, `readBundledDefaults`, dan clear cache di document directory | `expo-file-system`, `assets/model-defaults.json` |
| `persistence/catalog-transfer.ts` | `pickOverridesJson`, `shareOverridesJson`, dan clear export temp file | `expo-document-picker`, `expo-file-system`, `expo-sharing` |
| `persistence/clear-all.ts` | Orkestrasi clear-all data dengan dependency injection agar dapat diuji tanpa native module | Menghapus attachment dan setting web tools bersama credential, endpoint, conversation, dan cache. |
| `persistence/web-tools-store.ts` | `webToolsStore`, migrasi provider gateway, dan pemetaan credential ID gateway atau Exa | `domain/web-tools`, `persistence/endpoint-store` |
| `persistence/conversation-store.ts` | `conversationRepository`, turn attachment dan image reference, tool audit/dedupe dan replay transcript, recovery, compaction, pagination, metrics, rename, delete, clear database | `domain/attachment`, `domain/conversation`, `domain/compaction`, `domain/tool`, `domain/usage`, `expo-sqlite` |
| `tools/gateway.ts` | Client HTTPS konkret gateway untuk `GET /health` dan `GET /search`, Exa `POST /search`, serta Firecrawl Keyless `POST /v2/scrape` | `domain/endpoint`, `domain/web-search`, `transport/body`, `expo/fetch` |
| `tools/registry.ts` | Registry `get_current_time`, `web_search`, dan `web_fetch` melalui Firecrawl Keyless | Provider dan credential search masuk sebagai konfigurasi request, bukan definition model. |
| `attachments/images.ts` | Pemilih image, staging app-private, cleanup orphan, dan clear-all | `domain/attachment`, `expo-file-system`, `expo-image-picker` |
| `attachments/image-input.ts` | Memvalidasi lalu membaca image staged menjadi data URL pada batas send Responses | `domain/attachment`, `expo-file-system` |
| `diagnostics/diagnostic-ring.ts` | Ring NDJSON lokal 2 MB yang hanya menyimpan metadata request aman | `expo-file-system` |
| `diagnostics/diagnostic-transfer.ts` | Export metadata ring ke JSON melalui share sheet | `diagnostic-ring`, `expo-file-system`, `expo-sharing` |
| `context/local-compaction.ts` | Memilih prefix turn, meminta summary terstruktur, retry tanpa output, validasi, dan menyimpan usage compaction terpisah | `domain/compaction`, `domain/context`, `persistence/conversation-store`, `transport/protocol` |

`CatalogStorage` sengaja sempit supaya test memakai `Map`, bukan berkas nyata. Ikuti pola ini untuk service baru.

### 3.5 src/ui dan src/app-info.ts

| File | Isi |
|---|---|
| `ui/tokens.ts` | Token spacing, radius, skala tipografi, dan family font platform. |
| `ui/theme.ts` | Palet parchment light/dark dengan warna teks eksplisit agar kontras konsisten. |
| `ui/components.tsx` | `Screen`, top bar, tombol utama, kartu link, blok informasi, dan placeholder bersama. |
| `ui/components.test.tsx` | Mengunci `Screen` agar selalu memenuhi tinggi route tanpa bergantung pada class runtime. |
| `app-info.ts` | `APP_NAME`, `EXPECTED_ANDROID_PACKAGE`. Dipakai test agar app.json tidak menyimpang. |

### 3.6 tools

| File | Isi |
|---|---|
| `fake-oai-server.mjs` | Fake endpoint dengan scenario lewat path atau header `X-Scenario`. Hanya memakai API key palsu. |
| `build-tests.mjs` | Kompilasi transport, tool registry, dan domain terkait ke `.tests-build/` sebagai ESM, mengganti penanda `__DEV__`, dan memakai fetch Node sebagai stub `expo/fetch`. |
| `transport.test.mjs` | Contract test transport discovery terhadap fake endpoint. |
| `onboarding.test.mjs` | Smoke test connect dan discover. |
| `responses.test.mjs` | Contract test stream, SSE event, cancellation, partial output, retry boundary, timing, tool argument, usage, chaining, dan error terhadap fake endpoint. |
| `chat-completions.test.mjs` | Contract test Chat Completions request mapping, stream deltas, usage, tool fragments, and endpoint-specific fields. |
| `protocol.test.mjs` | Contract test explicit protocol selection, equivalent event sequence, Auto fallback boundary, cache, and Responses-only, Chat-only, and dual exit gates. |
| `conversations.test.mjs` | Contract test SQLite nyata untuk migration, WAL, FK cascade, partial recovery, tool audit/dedupe, metadata turn, compaction, dan keyset pagination. |
| `model-fields.test.mjs` | Contract test normalizer terhadap bentuk payload GET /models AmanAI yang sudah diverifikasi. |
| `dump-endpoint-fields.mjs` | Fetch langsung endpoint dari `.env` dan mencetak nama field, tipe, serta kelengkapan tanpa mencetak credential. |
| `smoke-models.mjs` | Menjalankan alur refresh repository produksi terhadap endpoint nyata dari `.env` lalu melaporkan metadata katalog. |
| `smoke-responses.mjs` | Menjalankan dua turn streaming terhadap endpoint nyata dan memverifikasi chaining serta timing tanpa mencetak prompt atau response. |
| `fake-server.test.mjs` | Contract test fake endpoint sendiri. |
| `web-tools.test.mjs` | Contract test private gateway health, query encoding, bearer authentication, dan fetch. |
| `exit-gate.mjs` | Bukti exit gate Phase 2 lewat kode produksi hasil kompilasi. |

Menambah modul yang dipakai contract test berarti menambah entry di `ENTRIES` pada `build-tests.mjs`.

## 4. Alur yang sudah berjalan

Onboarding: `app/setup.tsx` menormalkan base URL, menampilkan preview URL final, lalu memanggil `connectAndDiscover` di `features/setup/onboarding.ts`. Fungsi itu membuat profile tanpa secret, memanggil `discoverModels` di `services/transport/models.ts`, menulis API key ke Keystore lewat `credentialStore`, dan menulis profile ke kv-store lewat `endpointStore`. Setelah berhasil, `seedCatalogCache` menulis snapshot live ke berkas katalog.

Katalog: `useModelCatalog` merakit repository dari `createCatalogRepository` dengan `fileCatalogStorage` dan `readBundledDefaults`. `discoverModels` menormalisasi payload provider satu kali, lalu repository menyimpan `ModelRecord` itu tanpa normalisasi ulang. `mergeCatalog` menggabungkan bundled, live, override, dan riwayat menjadi `MergedModel`. Picker dapat menambah model custom dan membuka detail. Detail menyimpan metadata serta request override. Editor JSON memvalidasi dan menampilkan preview sebelum replace atomik; import tidak menyentuh file aktif sebelum save, sedangkan export hanya memakai schema override.

Gerbang masuk: `app/index.tsx` memakai `useActiveEndpoint`, yang membaca profile dari kv-store. Fresh install mengembalikan null dan diarahkan ke `app/setup.tsx`.

Chat: `chat-screen.tsx` membaca endpoint aktif dan `useChat` memuat conversation terakhir atau ID route dari SQLite. Composer image hanya tampil untuk model dengan modality `image` dan protocol Responses eksplisit, sehingga modality unknown memerlukan override model. PNG, JPEG, dan WebP divalidasi lalu disalin ke staging app-private. Saat send, image staged menjadi Responses `input_image` data URL; Chat Completions dan generic file upload tidak ditawarkan. Startup membersihkan staging orphan; new chat, delete conversation, dan clear-all menghapus image yang tidak lagi direferensikan.

History: `history-screen.tsx` membaca `conversationRepository.list` dengan keyset pagination `(updatedAt, id)`. Conversation dapat dibuka, diubah judulnya, atau dihapus dengan confirmation. Foreign key cascade membersihkan turn, item, usage, dan timing; file image hanya dihapus bila tidak direferensikan conversation lain.

Metrics: `conversationRepository.loadTurnMetrics` membaca usage dan timing per turn, lalu `domain/usage` menormalkan token provider serta menghitung TTFT, TPS, cache read, cache write, dan input uncached. `chat-screen.tsx` menampilkan turn terakhir dan ringkasan sesi; field cache yang hilang ditampilkan sebagai unavailable.

Request history: `conversationRepository.loadRequestHistory` mengambil user item dan assistant item completed secara berurutan. `use-chat.ts` mengirim hasilnya sebagai Responses `input`, tanpa menggantungkan recall pada `previous_response_id` remote. Conversation ID yang sama dikirim sebagai `prompt_cache_key` agar endpoint kompatibel dapat mempertahankan cache affinity.

Web tools: Settings menyimpan pilihan provider, URL gateway HTTPS, enabled state, dan SearXNG engine di storage aplikasi, sedangkan bearer token gateway dan API key Exa berada di SecureStore dengan credential ID terpisah. Gateway meneruskan `web_search` dengan engine default `bing` melalui `GET /search`; aplikasi tidak menghubungi SearXNG atau URL hasil secara langsung. Exa mengekspos `web_search` melalui `POST https://api.exa.ai/search`, memakai `x-api-key`, serta memetakan `time_range` ke `startPublishedDate`; tidak ada health test karena search dapat billable. Semua provider search mengaktifkan `web_fetch` melalui Firecrawl Keyless `POST https://api.firecrawl.dev/v2/scrape` tanpa credential, dengan URL halaman dikirim ke Firecrawl dan hasil Markdown. Semua jalur membatasi raw response 64 KB dan output model 12 KB. Hasil diteruskan sebagai JSON mentah tanpa normalisasi; `chat-screen.tsx` hanya membaca field source card dan menampilkannya sebagai untrusted content. `GET /health` tersedia untuk gateway tanpa token.

Local compaction: preflight menghitung effective context. Saat trigger tercapai, `local-compaction.ts` meminta JSON summary lewat request stateless, memvalidasi schema, dan menyimpan hasil serta usage di `compactions`; transcript asli tetap utuh. Request history berikutnya memakai summary sebagai user/data context dengan label untrusted dan recent turns setelah source range. Hard stop menghentikan send sebelum turn baru dibuat.

## 5. Yang belum ada

| Area | Fase | Keterangan |
|---|---|---|
| Gate Android streaming | 5 | Implementasi selesai; verifikasi emulator dan device fisik menunggu laporan manual. |
| Gate Android recovery | 6 | Implementasi selesai; verifikasi kill app saat stream dan recovery UI menunggu laporan manual. |
| Context meter | 9 | Implementasi pure domain, hook debounce, dan pill selesai; verifikasi Android/manual masih menunggu. |
| Auto-compact | 10 | Implementasi migration, local summary, preflight, replay, manual action, toggle, dan hard stop selesai; verifikasi Android/manual masih menunggu. |
| MVP hardening | 11 | Sebagian selesai: hardening transport, accessibility dasar, backup, dan error detail sudah ada. Clear-all-data, diagnostic ring, E2E, serta gate Android/internal build masih belum ada. |
| Web tools | 14 | Private gateway atau Exa search, plus Firecrawl Keyless fetch selesai; verifikasi Android/manual masih menunggu. |
| Attachment Android gate | 15 | Implementasi dan test otomatis selesai; satu image flow endpoint nyata dan pemeriksaan memory pada device masih menunggu. |

## 6. Aturan saat menambah berkas

1. Tentukan layer lebih dulu. Tipe dan pure logic ke `domain`, I/O ke `services`, UI dan orkestrasi ke `features`, route tipis ke `app`.
2. Jangan membuat interface dengan satu implementasi. Tambahkan saat implementasi kedua benar-benar ada.
3. Jangan membuat folder `utils` atau barrel `index.ts`.
4. Perbarui bagian 2 dan 3 dokumen ini pada commit yang sama dengan perubahan struktur.
5. Jangan mencatat versi dependency di sini. Versi tinggal di `package.json` dan bagian Generated toolchain README.md.
6. Jangan menyalin isi PLAN.md. Cukup catat fase dan tautan ke bagiannya.
