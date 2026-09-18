# Peta Codebase MyLLM

Peta struktur folder, tanggung jawab file, dan dependency antar layer. Dipakai supaya executor dan agent tidak perlu membaca seluruh repository untuk menemukan tempat sebuah perubahan.

Status: implementasi hardening Phase 11 berjalan selesai. Gate manual Android untuk streaming, recovery, model override, context meter, auto-compact, dan internal build masih menunggu; clear-all-data, diagnostic ring, dan E2E belum ada.

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
      _layout.tsx                   tab Beranda dan Model dengan ikon native
      index.tsx                     re-export layar chat utama
      models.tsx                    re-export src/features/models/models-screen
    settings/
      index.tsx                     placeholder settings (Phase 2, 3, 10)
      models.tsx                    re-export src/features/models/models-screen
      model.tsx                     re-export detail dan override satu model
      models-json.tsx               re-export editor JSON model override
    chat/
      [conversationId].tsx          re-export layar chat untuk conversation tersimpan atau new
  src/
    app-info.ts                     konstanta nama app dan application ID
    app-info.test.ts
    domain/                         tipe dan pure logic, tanpa I/O
      endpoint.ts                   EndpointProfile, normalisasi base URL, join path, header auth
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
      model-config.ts               reasoning, output cap, dan request config snapshot
      model-config.test.ts
      context.ts                    estimasi context budget preflight dan safety margin
      context.test.ts
      compaction.ts                 policy, selection, prompt, schema summary, dan effective context
      compaction.test.ts
      conversation.ts               tipe message, status turn, summary, cursor, auto title
      conversation.test.ts
      usage.ts                      normalisasi usage provider, timing, cache bucket, dan metrics
      usage.test.ts
      sse.ts                        parser frame SSE incremental dan UTF-8 streaming
      sse.test.ts
      system-prompt.ts              system prompt v1 berdasarkan model ID exact
      system-prompt.test.ts
    features/                       UI dan orkestrasi per layar
      chat/
        chat-screen.tsx             message list, single-card composer toolbar, thinking modal, streaming, compact request stats, Stop, retry, New chat, and compaction separator
        context-pill.tsx            small SVG context ring with modal details, toggle, and Compact now
        context-pill.test.tsx
        use-chat.ts                 state chat memory, context budget debounce, preflight local compaction, hard stop, toggle, metrics, stateless history replay, batching delta, cancellation, request orchestration
        use-chat.test.tsx
      history/
        history-screen.tsx          pagination, buka, rename, delete, New chat
      setup/
        onboarding.ts               alur connect, discover, simpan profile dan credential
        onboarding.test.ts
        use-active-endpoint.ts      hook endpoint aktif dari kv-store
        error-copy.ts               teks error untuk pengguna
      models/
        models-screen.tsx           layar picker model
        models-screen.test.tsx
        model-detail-screen.tsx     detail provenance, request control, dan override form
        models-json-screen.tsx      editor, preview, import, dan export override JSON
        use-model-catalog.ts        hook runtime katalog dan refresh coalescing
        use-model-catalog.test.tsx
        catalog-seed.ts             tulis snapshot hasil discover pertama
        model-badges.ts             badge metadata dan ringkasan refresh
    services/                       I/O ke luar proses
      credentials/
        store.ts                    API key di Keystore
        store.test.ts
      transport/
        models.ts                   GET /models dengan timeout dan tanpa redirect
        responses.ts                POST /responses streaming, event mapping, timing, cancellation, retry, dan Retry-After
        body.ts                     pembacaan response dengan cap 256 KB
        body.test.ts                test cap body response
      context/
        local-compaction.ts         local summary request, retry satu kali, validation, dan compaction usage
        local-compaction.test.ts
      persistence/
        conversation-store.ts       migration SQLite, repository history, metrics, recovery, dan compaction
        endpoint-store.ts           profile endpoint dan activeModelId di kv-store
        endpoint-store.test.ts
        settings-store.ts           activeModelId untuk endpoint aktif
        catalog-store.ts            baca, tulis, backup snapshot katalog
        catalog-store.test.ts
        catalog-files.ts            implementasi CatalogStorage lewat expo-file-system
        catalog-files.test.ts
        catalog-transfer.ts         import document picker dan export share sheet
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
    conversations.test.mjs          contract migration, cascade, recovery, pagination
    model-fields.test.mjs           contract bentuk field model AmanAI
    dump-endpoint-fields.mjs        inspeksi field GET /models tanpa mencetak secret
    smoke-models.mjs                refresh katalog nyata terhadap endpoint di .env
    smoke-responses.mjs             dua turn Responses API nyata tanpa mencetak isi pesan
    exit-gate.mjs                   bukti exit gate Phase 2
  docs/
    CODEBASE.md                     dokumen ini
  PLAN.md                           rencana fase dan kontrak executor
  RESEARCH_REACT_NATIVE_ANDROID_LLM_CLIENT.md
  README.md
~~~

Folder yang muncul di struktur target tetapi belum ada: `modules/`, dan berkas `domain` untuk tool. Buat hanya saat fase pertama yang membutuhkannya.

## 3. Tanggung jawab berkas

### 3.1 app

| File | Tanggung jawab | Bergantung pada |
|---|---|---|
| `app/_layout.tsx` | Stack root, StatusBar, import `global.css` | expo-router |
| `app/index.tsx` | Redirect ke setup atau tabs berdasarkan endpoint aktif | `features/setup/use-active-endpoint` |
| `app/setup.tsx` | Form base URL, auth mode, dan API key; preview URL; panggil connect; tampilkan error | `domain/endpoint`, `features/setup/*`, `features/models/catalog-seed`, `services/transport/models`, `services/persistence/catalog-files` |
| `app/(tabs)/_layout.tsx` | Dua tab: Beranda dan Model, warna theme, dan ikon native lintas platform | expo-router, expo-symbols, `ui/theme` |
| `app/(tabs)/index.tsx` | Re-export layar chat utama | `features/chat/chat-screen` |
| `app/(tabs)/models.tsx` | Re-export layar picker | `features/models/models-screen` |
| `app/settings/models.tsx` | Re-export layar picker | `features/models/models-screen` |
| `app/settings/model.tsx` | Re-export detail dan override model | `features/models/model-detail-screen` |
| `app/settings/models-json.tsx` | Re-export editor JSON override | `features/models/models-json-screen` |
| `app/settings/index.tsx` | Placeholder settings | react-native |
| `app/history.tsx` | Re-export layar history | `features/history/history-screen` |
| `app/chat/[conversationId].tsx` | Re-export chat untuk membuka conversation tersimpan atau route `new` | `features/chat/chat-screen` |

Route hanya menyusun screen dan dependency. Logic tetap berada di `features`.

### 3.2 src/domain

| File | Isi | Catatan kontrak |
|---|---|---|
| `endpoint.ts` | `EndpointProfileSchema`, `createEndpointProfile`, `normalizeBaseUrl`, `joinEndpointPath`, `buildAuthHeaders`, `buildCustomHeaders`, `validateBaseUrl` | Cleartext HTTP hanya untuk host loopback pada build development. Profile tidak pernah menyimpan API key. |
| `error.ts` | `AppError`, `createAppError`, `redactText`, `categorizeHttpStatus`, `parseProviderErrorBody`, `fromHttpResponse`, `fromNetworkError`, `appErrorToDiagnostic` | Setiap pesan yang mungkin memuat secret melewati redaksi. |
| `model.ts` | `ModelRecord`, `ModelCapabilities`, `CapabilityState`, `UNKNOWN_CAPABILITIES` | Field hilang bernilai null atau unknown, bukan false atau nol. |
| `model-list.ts` | `parseModelList`, `normalizeModelRecord`, `OpenAiModelListSchema`, `EnrichedModelFieldsSchema` | Envelope divalidasi, elemen data loose, record rusak ditolak per record. |
| `catalog.ts` | Schema katalog, override, parser JSON, preview perubahan, serializer, dan pricing | Field yang tidak ada berarti inherit, null berarti hapus override. Schema future ditolak. |
| `catalog-merge.ts` | `mergeCatalog`, `MergedModel`, `ProvenanceMap`, `CATALOG_SOURCES` | Urutan menang: user-override, live, bundled. `enabled`, request setting, dan provenance dihitung di sini. |
| `model-config.ts` | `effectiveMaxOutput`, `reasoningChoices`, `modelRequestSnapshot`, `protocolOutputCap` | Memvalidasi effort, output limit, context policy, dan membuat config immutable sebelum request. |
| `context.ts` | `ContextPolicySchema`, default policy, `buildContextBudget` | Menghitung effective input, output reserve, safety margin, occupancy, dan calibration hint tanpa I/O. |
| `compaction.ts` | `CompactionSummarySchema`, prefix selector, prompt, parser, `buildCompactedContext` | Menjaga summary sebagai data untrusted dan memilih boundary turn lengkap tanpa menghapus transcript. |
| `conversation.ts` | `ChatMessage`, `TurnStatus`, `ConversationSummary`, `ConversationCursor`, `titleFromPrompt` | Status mengunci sending, streaming, terminal, dan interrupted. |
| `usage.ts` | `NormalizedUsage`, `TurnMetrics`, normalisasi field Responses, cache bucket, TTFT, TPS, dan session summary | Field usage yang hilang tetap null; cached input tidak dijumlahkan ulang. |
| `sse.ts` | `createSseParser`, `SseFrame`, parser incremental `Uint8Array` dengan `TextDecoder` stream mode | Menangani LF, CRLF, comment, multiline data, event field, `[DONE]`, dan EOF. |
| `system-prompt.ts` | `buildSystemPrompt`, `SYSTEM_PROMPT_VERSION`, instruksi asisten MyLLM dan model ID exact | Hanya menyebut capability yang tersedia; model ID di-escape sebagai JSON string. |

`domain` belum punya berkas untuk tool. Tambahkan pada fase yang memerlukannya.

### 3.3 src/features

| File | Isi | Bergantung pada |
|---|---|---|
| `setup/onboarding.ts` | `connectAndDiscover`, `profileFromInput`, `suggestName`, `newCredentialId`, `loadCredentialFor` | `domain/endpoint`, `domain/error`, `services/credentials/store`, `services/transport/models`, `services/persistence/endpoint-store` |
| `setup/use-active-endpoint.ts` | `useActiveEndpoint` mengembalikan status loading atau ready | `services/persistence/endpoint-store` |
| `setup/error-copy.ts` | `describe`, `modelSummary`, `ErrorCopy` | `domain/error`, `domain/model` |
| `chat/chat-screen.tsx` | Message list, single-card composer toolbar, reasoning modal, compact request stats, Send or Stop, partial output, error, retry, New chat, compaction separator, and context controls | `domain/conversation`, `domain/context`, `domain/usage`, `features/chat/use-chat`, `features/setup/use-active-endpoint`, `ui/*` |
| `chat/use-chat.ts` | Orkestrasi conversation aktif, context preflight, local compaction, hard stop, toggle, reasoning override, config snapshot model, SQLite sebelum request, metrics per turn, stateless history replay, cache key per conversation, batching UI dan DB 50 ms, recovery, cancellation, dan retry | `domain/*`, `services/context/local-compaction`, `services/credentials`, `services/persistence/*`, `services/transport/responses` |
| `history/history-screen.tsx` | History `FlatList` dengan keyset pagination, buka chat, rename, delete confirmation, dan New chat | `domain/conversation`, `services/persistence/conversation-store`, `ui/*` |
| `models/models-screen.tsx` | Layar picker: daftar, refresh, pilih model aktif, tambah model exact ID, dan tautan editor | `domain/catalog-merge`, `services/persistence/endpoint-store`, `features/setup/use-active-endpoint`, `models/model-badges`, `models/use-model-catalog` |
| `models/model-detail-screen.tsx` | Nilai efektif dan provenance, reasoning, output limit, metadata override, reset field dan model | `domain/catalog`, `domain/model-config`, `models/use-model-catalog`, `ui/*` |
| `models/models-json-screen.tsx` | Raw JSON editor, validation path, preview model, import, export, dan save | `models/use-model-catalog`, `services/persistence/catalog-transfer`, `ui/*` |
| `models/use-model-catalog.ts` | `useModelCatalog` menyatukan refresh, model override, custom model, preview, replace JSON, dan export | `services/persistence/catalog-store`, `services/persistence/catalog-files`, `services/credentials/store`, `services/transport/models` |
| `models/catalog-seed.ts` | `seedCatalogCache` menulis snapshot setelah discover pertama | `services/persistence/catalog-store` |
| `models/model-badges.ts` | `modelBadges`, `formatTokens`, `describeRefresh` | `domain/catalog-merge` |

`models-screen.test.tsx` mengunci badge metadata dan state model. `use-model-catalog.test.tsx` mengunci refresh manual, metadata hasil normalisasi, dan last-known-good saat endpoint gagal.

### 3.4 src/services

| File | Isi | Bergantung pada |
|---|---|---|
| `credentials/store.ts` | `createCredentialStore` di atas `expo-secure-store`, prefix key `myllm.credential.` | modul native dimuat lazy |
| `transport/models.ts` | `discoverModels`, `modelsUrl`, timeout 15 detik, redirect tidak diikuti | `domain/endpoint`, `domain/error`, `domain/model-list` |
| `transport/responses.ts` | `responsesClient`, `responsesUrl`, `buildResponsesBody`, request reasoning, output, dan prompt cache key optional, POST streaming, event internal, timing, retry pra-event, dan cancellation | `domain/endpoint`, `domain/error`, `domain/sse`, `domain/system-prompt`, `expo/fetch` |
| `persistence/endpoint-store.ts` | Profile endpoint dan activeModelId di `expo-sqlite/kv-store` | `domain/endpoint` |
| `persistence/settings-store.ts` | `loadActiveModelId` dan penulisan model aktif | `persistence/endpoint-store` |
| `persistence/catalog-store.ts` | `createCatalogRepository`, atomic snapshot dan override, preview/import, custom model, `loadModelRequestSnapshot`, dan `saveModelReasoningEffort` | `domain/catalog`, `domain/catalog-merge`, `domain/model-config`, `domain/endpoint` |
| `persistence/catalog-files.ts` | `fileCatalogStorage` dan `readBundledDefaults` di document directory | `expo-file-system`, `assets/model-defaults.json` |
| `persistence/catalog-transfer.ts` | `pickOverridesJson` dan `shareOverridesJson` untuk Android document picker dan share sheet | `expo-document-picker`, `expo-file-system`, `expo-sharing` |
| `persistence/conversation-store.ts` | `conversationRepository`, migration v1 dan v2, WAL, foreign key, atomic turn writes, recovery, request history, compaction source and active summary, pagination, normalized metrics, rename, delete | `domain/conversation`, `domain/compaction`, `domain/usage`, `services/transport/responses`, `expo-sqlite` |
| `context/local-compaction.ts` | Memilih prefix turn, meminta summary terstruktur, retry tanpa output, validasi, dan menyimpan usage compaction terpisah | `domain/compaction`, `domain/context`, `persistence/conversation-store`, `transport/responses` |

`CatalogStorage` sengaja sempit supaya test memakai `Map`, bukan berkas nyata. Ikuti pola ini untuk service baru.

### 3.5 src/ui dan src/app-info.ts

| File | Isi |
|---|---|
| `ui/tokens.ts` | Token spacing, radius, dan ukuran teks. |
| `ui/theme.ts` | Palet light/dark dengan warna teks eksplisit agar kontras konsisten. |
| `ui/components.tsx` | `Screen`, tombol utama, kartu link, blok informasi, dan placeholder bersama. |
| `ui/components.test.tsx` | Mengunci `Screen` agar selalu memenuhi tinggi route tanpa bergantung pada class runtime. |
| `app-info.ts` | `APP_NAME`, `EXPECTED_ANDROID_PACKAGE`. Dipakai test agar app.json tidak menyimpang. |

### 3.6 tools

| File | Isi |
|---|---|
| `fake-oai-server.mjs` | Fake endpoint dengan scenario lewat path atau header `X-Scenario`. Hanya memakai API key palsu. |
| `build-tests.mjs` | Kompilasi transport model, Responses client, onboarding, dan domain terkait ke `.tests-build/` sebagai ESM, mengganti penanda `__DEV__`, dan memakai fetch Node sebagai stub `expo/fetch`. |
| `transport.test.mjs` | Contract test transport discovery terhadap fake endpoint. |
| `onboarding.test.mjs` | Smoke test connect dan discover. |
| `responses.test.mjs` | Contract test stream, SSE event, cancellation, partial output, retry boundary, timing, tool argument, usage, chaining, dan error terhadap fake endpoint. |
| `conversations.test.mjs` | Contract test SQLite nyata untuk migration, WAL, FK cascade, partial recovery, metadata turn, compaction, dan keyset pagination. |
| `model-fields.test.mjs` | Contract test normalizer terhadap bentuk payload GET /models AmanAI yang sudah diverifikasi. |
| `dump-endpoint-fields.mjs` | Fetch langsung endpoint dari `.env` dan mencetak nama field, tipe, serta kelengkapan tanpa mencetak credential. |
| `smoke-models.mjs` | Menjalankan alur refresh repository produksi terhadap endpoint nyata dari `.env` lalu melaporkan metadata katalog. |
| `smoke-responses.mjs` | Menjalankan dua turn streaming terhadap endpoint nyata dan memverifikasi chaining serta timing tanpa mencetak prompt atau response. |
| `fake-server.test.mjs` | Contract test fake endpoint sendiri. |
| `exit-gate.mjs` | Bukti exit gate Phase 2 lewat kode produksi hasil kompilasi. |

Menambah modul yang dipakai contract test berarti menambah entry di `ENTRIES` pada `build-tests.mjs`.

## 4. Alur yang sudah berjalan

Onboarding: `app/setup.tsx` menormalkan base URL, menampilkan preview URL final, lalu memanggil `connectAndDiscover` di `features/setup/onboarding.ts`. Fungsi itu membuat profile tanpa secret, memanggil `discoverModels` di `services/transport/models.ts`, menulis API key ke Keystore lewat `credentialStore`, dan menulis profile ke kv-store lewat `endpointStore`. Setelah berhasil, `seedCatalogCache` menulis snapshot live ke berkas katalog.

Katalog: `useModelCatalog` merakit repository dari `createCatalogRepository` dengan `fileCatalogStorage` dan `readBundledDefaults`. `discoverModels` menormalisasi payload provider satu kali, lalu repository menyimpan `ModelRecord` itu tanpa normalisasi ulang. `mergeCatalog` menggabungkan bundled, live, override, dan riwayat menjadi `MergedModel`. Picker dapat menambah model custom dan membuka detail. Detail menyimpan metadata serta request override. Editor JSON memvalidasi dan menampilkan preview sebelum replace atomik; import tidak menyentuh file aktif sebelum save, sedangkan export hanya memakai schema override.

Gerbang masuk: `app/index.tsx` memakai `useActiveEndpoint`, yang membaca profile dari kv-store. Fresh install mengembalikan null dan diarahkan ke `app/setup.tsx`.

Chat: `chat-screen.tsx` membaca endpoint aktif dan `useChat` memuat conversation terakhir atau ID route dari SQLite. Pilihan reasoning dapat diubah dari composer dan disimpan sebagai override model. Sebelum request, config reasoning dan output limit dibaca sebagai snapshot immutable dari katalog. User turn dan assistant placeholder ditulis atomik sebelum network. `responsesClient` mengirim system instructions v1 dan membaca SSE dari `expo/fetch`; delta text dan reasoning di-flush ke UI dan SQLite sekitar 50 ms. Final response menyimpan status, response ID, usage, dan timing. Startup mengubah sending atau streaming lama menjadi interrupted. Completed response memakai markdown; streaming dan partial memakai Text.

History: `history-screen.tsx` membaca `conversationRepository.list` dengan keyset pagination `(updatedAt, id)`. Conversation dapat dibuka, diubah judulnya, atau dihapus dengan confirmation. Foreign key cascade membersihkan turn, item, usage, dan timing.

Metrics: `conversationRepository.loadTurnMetrics` membaca usage dan timing per turn, lalu `domain/usage` menormalkan token provider serta menghitung TTFT, TPS, cache read, cache write, dan input uncached. `chat-screen.tsx` menampilkan turn terakhir dan ringkasan sesi; field cache yang hilang ditampilkan sebagai unavailable.

Request history: `conversationRepository.loadRequestHistory` mengambil user item dan assistant item completed secara berurutan. `use-chat.ts` mengirim hasilnya sebagai Responses `input`, tanpa menggantungkan recall pada `previous_response_id` remote. Conversation ID yang sama dikirim sebagai `prompt_cache_key` agar endpoint kompatibel dapat mempertahankan cache affinity.

Local compaction: preflight menghitung effective context. Saat trigger tercapai, `local-compaction.ts` meminta JSON summary lewat request stateless, memvalidasi schema, dan menyimpan hasil serta usage di `compactions`; transcript asli tetap utuh. Request history berikutnya memakai summary sebagai user/data context dengan label untrusted dan recent turns setelah source range. Hard stop menghentikan send sebelum turn baru dibuat.

## 5. Yang belum ada

| Area | Fase | Keterangan |
|---|---|---|
| Gate Android streaming | 5 | Implementasi selesai; verifikasi emulator dan device fisik menunggu laporan manual. |
| Gate Android recovery | 6 | Implementasi selesai; verifikasi kill app saat stream dan recovery UI menunggu laporan manual. |
| Context meter | 9 | Implementasi pure domain, hook debounce, dan pill selesai; verifikasi Android/manual masih menunggu. |
| Auto-compact | 10 | Implementasi migration, local summary, preflight, replay, manual action, toggle, dan hard stop selesai; verifikasi Android/manual masih menunggu. |
| MVP hardening | 11 | Sebagian selesai: hardening transport, accessibility dasar, backup, dan error detail sudah ada. Clear-all-data, diagnostic ring, E2E, serta gate Android/internal build masih belum ada. |

## 6. Aturan saat menambah berkas

1. Tentukan layer lebih dulu. Tipe dan pure logic ke `domain`, I/O ke `services`, UI dan orkestrasi ke `features`, route tipis ke `app`.
2. Jangan membuat interface dengan satu implementasi. Tambahkan saat implementasi kedua benar-benar ada.
3. Jangan membuat folder `utils` atau barrel `index.ts`.
4. Perbarui bagian 2 dan 3 dokumen ini pada commit yang sama dengan perubahan struktur.
5. Jangan mencatat versi dependency di sini. Versi tinggal di `package.json` dan bagian Generated toolchain README.md.
6. Jangan menyalin isi PLAN.md. Cukup catat fase dan tautan ke bagiannya.
