# Implementation Plan Aplikasi Chat LLM Android

Status: Phase 15 implementation and automated tests completed on 20 September 2026. The Android endpoint and memory exit gate remain manual.

Tanggal: 16 September 2026.

Dokumen sumber: RESEARCH_REACT_NATIVE_ANDROID_LLM_CLIENT.md.

Mode perencanaan: Ponytail ultra. Setiap fase harus menghasilkan kemampuan yang dapat dijalankan, diuji, dan didemonstrasikan. Jangan membuat abstraksi untuk fitur fase berikutnya sebelum abstraksi itu benar-benar memiliki lebih dari satu implementasi.

## 1. Tujuan akhir

Membangun aplikasi Android berbasis React Native yang:

- meminta custom OpenAI-compatible endpoint dan API key saat first launch;
- menemukan model melalui GET /models;
- memakai AmanAI sebagai reference profile dan smoke-test endpoint, bukan dependency wajib;
- mendukung Responses API, streaming, reasoning, metadata model, history, context meter, auto-compact, dan statistik;
- menambahkan Chat Completions, tools, web search, attachment, background generation, dan multi-endpoint secara bertahap;
- tidak menjalankan arbitrary command di dalam proses aplikasi;
- baru menambahkan Termux atau remote sandbox setelah MVP stabil dan threat model disetujui.

## 2. Kontrak untuk executor

### Batas eksekusi agent

Agent tidak boleh menjalankan Expo atau build Android karena keterbatasan RAM pemilik proyek. Jangan menjalankan `expo`, `npx expo`, `expo prebuild`, `expo run:*`, `npx expo-doctor`, `npm run doctor`, bundler, emulator, device check, Gradle, APK, atau AAB. Agent hanya membuat kode dan menjalankan TypeScript, ESLint langsung, Jest, serta contract test Node. Pemeriksaan Expo dan build Android dilakukan manual oleh pemilik proyek.

All user-facing UI copy, accessibility labels, error copy added by the agent, and new Markdown instructions must use English.

Executor wajib mengikuti aturan ini:

1. Kerjakan fase secara berurutan.
2. Jangan mulai fase berikutnya sebelum exit gate fase aktif lulus.
3. Jalankan ESLint langsung, typecheck, dan test yang relevan sebelum menandai langkah selesai.
4. Pertahankan kode dalam keadaan siap dibuild setelah setiap fase; build aktual diverifikasi manual oleh pemilik proyek.
5. Tambahkan dependency hanya pada fase yang pertama kali memerlukannya.
6. Gunakan API native atau package yang sudah dipilih sebelum menulis abstraction sendiri.
7. Jangan menambahkan Redux, Zustand, ORM, Axios, EventSource package, dependency injection container, UI framework, monorepo, atau plugin framework tanpa bukti kebutuhan.
8. Jangan membuat interface dengan satu implementasi hanya untuk kemungkinan masa depan. Refactor menjadi interface saat implementasi kedua benar-benar ditambahkan.
9. Jangan menyimpan API key, prompt, response, atau tool output di log.
10. Jangan mengubah model ID yang diberikan endpoint.
11. Jangan menganggap field yang hilang bernilai false atau nol. Gunakan unknown atau null.
12. Jangan melakukan silent truncation, silent protocol fallback, atau silent security downgrade.
13. Jangan melakukan request billable untuk capability probing.
14. Jika keputusan produk yang dibutuhkan belum tersedia, gunakan default yang tercantum di dokumen ini.
15. Jika sebuah gate gagal, perbaiki fase aktif. Jangan menutupinya dengan implementasi fase berikutnya.

Setiap fase sebaiknya menjadi satu commit atau serangkaian commit kecil yang hanya berisi scope fase tersebut. Update checklist PLAN.md setelah verifikasi, bukan sebelum verifikasi.

## 3. Keputusan awal dan default

Gunakan default berikut sampai pemilik proyek memutuskan lain:

| Area | Keputusan awal |
|---|---|
| Platform | Android |
| App name sementara | MyLLM |
| Application ID | Harus dipilih sekali pada Phase 0 sebelum build publik |
| Framework | Expo stable dengan React Native yang dipasangkan oleh Expo |
| Architecture | React Native New Architecture dan Hermes |
| Language | TypeScript strict |
| Minimum Android | API 26 |
| Endpoint awal | Diisi pengguna, tidak ada provider default |
| Reference endpoint | AmanAI |
| Active endpoint | Satu pada MVP |
| Protocol MVP | Responses API |
| Chat Completions | Ditambahkan setelah MVP core stabil |
| Content | Text, plus gated image input for declared Responses-capable models |
| Image attachment | PNG, JPEG, WebP; max 8 MB per image, 12 MB per message, four images; only declared Responses image modality |
| State remote | Stateless replay dari history lokal; `previous_response_id` hanya jika endpoint mendokumentasikan dukungan |
| Local history | Selalu authoritative untuk UI |
| Database encryption | Tidak memakai SQLCipher pada MVP |
| Background generation | Foreground-only pada MVP |
| Auto-compact | Aktif, trigger 80%, target 55%, hard stop 95% |
| Command execution | Disabled |
| Distribution awal | Development build dan internal APK |
| Cleartext HTTP | Ditolak pada release |

Keputusan yang harus diminta sebelum relevan:

- Application ID final sebelum build yang akan didistribusikan.
- Apakah background generation wajib sebelum Phase 16.
- Apakah Termux, remote sandbox, atau keduanya benar-benar dibutuhkan sebelum Phase 18.

## 4. Tech stack

### 4.1 Stack inti

| Kebutuhan | Pilihan | Alasan |
|---|---|---|
| Framework | Expo stable, React Native, React | Jalur setup Android paling pendek dan tetap dapat menambahkan native module |
| Routing | Expo Router | Sudah tersedia pada template default dan menghindari konfigurasi navigator manual |
| Language | TypeScript strict | Domain API, event stream, dan JSON perlu tipe yang eksplisit |
| JS engine | Hermes | Default React Native modern |
| RN architecture | New Architecture | Default React Native modern dan jalur native module masa depan |
| Styling | React Native StyleSheet dan design tokens lokal | Tidak membutuhkan UI framework |
| Networking | expo/fetch, AbortController, ReadableStream, TextDecoder | Mendukung streaming response pada Android tanpa native module khusus |
| Endpoint/model settings | expo-sqlite/kv-store | Sudah ikut dependency database, tidak perlu AsyncStorage |
| Conversation database | expo-sqlite direct SQL | Transaksi, pagination, WAL, dan migration tanpa ORM |
| Credentials | expo-secure-store | Android memakai encrypted storage yang dilindungi Keystore |
| Model JSON files | expo-file-system | App-private files, import, export, temp file, dan rename |
| Runtime validation | zod | Memvalidasi response endpoint dan editable JSON pada trust boundary |
| Markdown | react-native-markdown-display, ditambahkan saat history UI | Menunda dependency sampai jawaban nyata perlu dirender |
| Testing | jest-expo | Preset resmi untuk Expo |
| Component testing | @testing-library/react-native, ditambahkan saat screen pertama stabil | Tidak dibutuhkan untuk pure domain logic |
| Contract server | Node.js built-in http module | Tidak perlu MSW atau server framework |
| E2E | Maestro, ditambahkan menjelang MVP release | Flow Android utama dapat diuji tanpa menulis native test harness |
| Package manager | npm dengan package-lock.json | Default, sederhana, satu aplikasi |

### 4.2 Toolchain policy

- Gunakan create-expo-app stable, bukan beta atau canary.
- Biarkan Expo memilih versi React Native, React, Gradle, compileSdk, dan targetSdk yang kompatibel.
- Gunakan npx expo install untuk package Expo agar versinya cocok dengan SDK.
- Gunakan Node LTS yang memenuhi minimum Expo SDK terpilih. Catat versi di .nvmrc.
- Gunakan JDK 17 kecuali template Expo stable secara eksplisit mengharuskan versi lain.
- Simpan package-lock.json.
- Jalankan npx expo-doctor setelah perubahan native dependency.
- Jangan melakukan upgrade Expo SDK di tengah fase fitur. Upgrade menjadi fase maintenance terpisah.

### 4.3 Dependency yang sengaja tidak dipakai

- Tidak memakai Axios. expo/fetch sudah cukup.
- Tidak memakai EventSource. Request chat memakai POST, custom headers, body JSON, dan streaming reader.
- Tidak memakai Redux atau Zustand. SQLite adalah source of truth, sedangkan state screen cukup dengan React hooks.
- Tidak memakai Drizzle, Prisma, atau Knex. SQL schema kecil dan direct SQL lebih mudah diaudit.
- Tidak memakai NativeWind atau component kit. Gunakan StyleSheet dan komponen kecil.
- Tidak memakai tokenizer package pada MVP. Gunakan provider usage dan estimasi konservatif berlabel estimated.
- Tidak memakai Sentry pada MVP. Gunakan diagnostic export ter-redact terlebih dahulu.
- Tidak memakai SQLCipher sampai ada keputusan bahwa transcript wajib terenkripsi at rest.
- Tidak menulis Kotlin HTTP module sebelum expo/fetch gagal pada contract test Android.

### 4.4 Native code policy

MVP diusahakan tanpa native module buatan sendiri. Native code baru boleh dibuat ketika:

1. expo/fetch gagal menjaga streaming atau cancellation pada device target;
2. foreground service dibutuhkan;
3. Termux bridge disetujui;
4. fitur platform tidak tersedia dari package Expo resmi.

Jika native code dibutuhkan, gunakan local Expo Module dengan Kotlin dan config plugin. Jangan menyebarkan edit manual ke banyak file generated Android.

## 5. Struktur repository target

Jangan membuat seluruh struktur pada Phase 0. Buat folder ketika fase pertama kali membutuhkannya.

~~~text
app/
  _layout.tsx
  index.tsx
  setup.tsx
  chat/
    [conversationId].tsx
  history.tsx
  settings/
    index.tsx
    endpoint.tsx
    models.tsx
src/
  domain/
    endpoint.ts
    model.ts
    conversation.ts
    usage.ts
    context.ts
    tool.ts
  features/
    setup/
    chat/
    history/
    models/
    settings/
    tools/
  services/
    credentials/
    catalog/
    transport/
    persistence/
    metrics/
    context/
  ui/
    tokens.ts
    components/
assets/
  model-defaults.json
tools/
  fake-oai-server.mjs
modules/
  created only when a native feature is approved
~~~

Aturan struktur:

- Route hanya menggabungkan screen dan dependency.
- Domain berisi tipe dan pure logic.
- Service berisi I/O.
- Feature berisi UI dan orchestration spesifik screen.
- Hindari barrel index.ts.
- Hindari folder utils umum. Letakkan helper dekat domain yang memakainya.

## 6. Urutan fase

~~~mermaid
flowchart LR
  P0[0 Bootstrap] --> P1[1 Domain and fixtures]
  P1 --> P2[2 Endpoint onboarding]
  P2 --> P3[3 Model catalog]
  P3 --> P4[4 Non-stream chat]
  P4 --> P5[5 Streaming]
  P5 --> P6[6 Persistence]
  P6 --> P7[7 Model controls]
  P7 --> P8[8 Metrics]
  P8 --> P9[9 Context meter]
  P9 --> P10[10 Auto-compact]
  P10 --> P11[11 MVP hardening]
  P11 --> P12[12 Chat fallback]
  P12 --> P13[13 Tool loop]
  P13 --> P14[14 Web tools]
  P14 --> P15[15 Attachments]
  P15 --> P16[16 Background]
  P16 --> P17[17 P1 completion]
  P17 --> P18[18 Sandbox gate]
  P18 --> P19[19 Termux]
  P18 --> P20[20 Remote sandbox]
  P19 --> P21[21 Workspace and MCP]
  P20 --> P21
  P21 --> P22[22 Advanced features]
~~~

## 7. Phase 0: Bootstrap dan toolchain

### Goal

Aplikasi template dapat dibuild dan dijalankan pada emulator atau device Android dengan quality scripts dasar.

### Steps

- [ ] Tentukan applicationId final atau placeholder internal yang belum pernah dipublikasikan.
- [ ] Pertahankan PLAN.md dan RESEARCH_REACT_NATIVE_ANDROID_LLM_CLIENT.md di root.
- [ ] Scaffold create-expo-app stable dengan TypeScript dan Expo Router.
- [ ] Jika create-expo-app menolak root yang tidak kosong, scaffold di temporary directory lalu pindahkan file aplikasi tanpa memindahkan .git atau menimpa Markdown.
- [ ] Gunakan npm dan commit package-lock.json.
- [ ] Hapus route demo, contoh asset, dan komponen tutorial yang tidak dipakai.
- [ ] Pertahankan hanya route index dengan teks MyLLM sementara.
- [ ] Aktifkan TypeScript strict. Jangan menambah path alias karena memerlukan konfigurasi bundler tambahan.
- [ ] Buat .nvmrc berdasarkan Node LTS yang kompatibel dengan Expo stable terpilih.
- [ ] Tambahkan scripts: start, android, lint, typecheck, test, test:ci, doctor.
- [ ] Install jest-expo dan buat satu smoke test pure minimal.
- [ ] Buat development build Android dan jalankan dengan npx expo run:android.
- [ ] Tambahkan expo-dev-client jika development build membutuhkannya.
- [ ] Install expo-build-properties hanya jika diperlukan untuk menetapkan minSdk 26 pada app config.
- [ ] Set minSdk 26 melalui konfigurasi Expo yang didukung.
- [ ] Pastikan New Architecture dan Hermes aktif.
- [ ] Tambahkan .env.example tanpa secret. Jangan membuat variabel EXPO_PUBLIC_API_KEY.
- [ ] Pastikan .gitignore mencakup .env lokal, build output, Expo state, temporary exports, dan runtime data.
- [ ] Catat versi Node, npm, Expo SDK, React Native, JDK, compileSdk, dan targetSdk pada bagian Generated toolchain di README singkat.

### Files expected

~~~text
app/_layout.tsx
app/index.tsx
package.json
package-lock.json
tsconfig.json
app.json or app.config.ts
.nvmrc
.env.example
~~~

### Verification

- [ ] npm run lint lulus.
- [ ] npm run typecheck lulus.
- [ ] npm run test:ci lulus.
- [ ] npx expo-doctor lulus tanpa dependency mismatch.
- [ ] Development build terbuka pada Android.
- [ ] Cold start tidak melakukan network request.

### Exit gate

Screenshot atau screen recording menunjukkan app shell berjalan pada Android. Semua quality commands lulus dari clean install.

### Do not build yet

Endpoint form, database schema, chat UI, model types lengkap, native HTTP module, CI release, dan design system besar.

## 8. Phase 1: Domain contracts dan fake endpoint

Status: selesai 16 September 2026. npm run lint, npm run typecheck, npm run test:ci (43 test), dan npm run test:server (10 test) lulus. Fake endpoint memakai node:http dan dijalankan terpisah dari Jest karena tidak membutuhkan environment React Native.

Penyimpangan kecil dari rencana:

- Validasi scheme dibatasi ke HTTPS saja, bukan hanya pada mode release. Tidak ada mode release yang dapat dikenali di layer domain, dan ini lebih ketat daripada rencana. HTTP lokal untuk pengembangan dibuka bersama transport chat.
- Fixture malformed hanya tersedia sebagai scenario fake server, belum sebagai file fixture terpisah, karena belum ada konsumen di luar test.

### Goal

Membentuk kontrak data minimum dan fake OpenAI-compatible server sebelum menyentuh API berbayar.

### Dependencies added

- zod

### Steps

- [x] Tambahkan src/domain/endpoint.ts dengan EndpointProfile, AuthMode, ProtocolMode, dan endpoint ID.
- [x] Tambahkan src/domain/model.ts dengan normalized model record dan CapabilityState: supported, unsupported, unknown.
- [x] Tambahkan AppError terstruktur dengan category, message, httpStatus, providerCode, requestId, retryable, dan safeDetails.
- [x] Implementasikan normalizeBaseUrl sebagai pure function.
- [x] Implementasikan joinEndpointPath sebagai pure function. Jangan memakai string concatenation bebas.
- [x] Implementasikan buildAuthHeaders untuk Bearer dan x-api-key.
- [x] Tolak URL non-absolute, embedded credentials, scheme selain HTTPS pada mode release, dan hostname kosong.
- [x] Tambahkan zod untuk schema response GET /models standar.
- [x] Izinkan extension field tetap dibaca oleh normalizer tanpa menjadikannya wajib.
- [x] Buat tools/fake-oai-server.mjs memakai node:http.
- [x] Fake server awal menyediakan GET /v1/models dan POST /v1/responses non-stream.
- [x] Tambahkan scenario melalui path atau request header untuk 401, 403, 404, empty list, invalid JSON, slow response, dan basic success.
- [x] Simpan fixture standard models dan AmanAI-style enriched models.
- [x] Jangan menambahkan Express, MSW, atau Docker.

### Tests

- [x] Base URL dengan dan tanpa trailing slash.
- [x] Base URL yang sudah memiliki /v1.
- [x] Endpoint path tidak menghasilkan /v1/v1.
- [x] Embedded username/password ditolak.
- [x] Header auth benar dan tidak muncul di diagnostic.
- [x] Standard model list diterima.
- [x] Missing model ID ditolak per record.
- [x] Unknown extension tidak membuat parser gagal.

### Exit gate

Pure tests lulus dan fake endpoint dapat mengembalikan model list serta satu non-stream response dengan curl.

Terpenuhi: 43 pure test lulus lewat npm run test:ci dan curl terhadap fake endpoint menghasilkan model list 200, enriched model list 200, 401 tanpa credential, dan satu non-stream response 200.

### Do not build yet

Generic transport interface, streaming parser, persistence, retry engine, atau provider plugin.

## 9. Phase 2: Endpoint onboarding dan secure credential

### Goal

Fresh install meminta endpoint dan API key, lalu menemukan model tanpa menyimpan secret di storage biasa.

### Dependencies added

- expo-secure-store
- expo-sqlite
- @testing-library/react-native

Gunakan npx expo install untuk package Expo dan npm development dependency untuk testing library.

### Steps

- [x] Buat CredentialStore kecil di atas expo-secure-store.
- [x] SecureStore hanya menyimpan API key dengan key berbasis credentialId.
- [x] Simpan EndpointProfile tanpa secret di expo-sqlite/kv-store.
- [x] Jangan menyimpan API key di React state lebih lama dari flow submit.
- [x] Buat app/index.tsx yang memeriksa apakah active endpoint valid.
- [x] Redirect ke setup jika belum ada endpoint.
- [x] Buat setup screen dengan endpoint name, base URL, API key, auth mode, dan advanced models path.
- [x] Protocol pada fase ini hanya Responses. Label sebagai MVP support, jangan tampilkan Auto sebelum Phase 12.
- [x] Tampilkan preview URL GET /models.
- [x] Implementasikan Connect & discover dengan timeout 15 detik dan AbortController.
- [x] Kirim credential hanya ke origin endpoint yang dimasukkan.
- [x] Gunakan redirect manual untuk request yang membawa credential. Jika expo/fetch pada device target tidak dapat menahan redirect sebelum credential diteruskan, perlakukan redirect sebagai transport gap yang harus diselesaikan sebelum release.
- [x] Normalisasi response model ke memory.
- [ ] Minta pengguna memilih satu model sebelum membuka app shell.
- [x] Simpan activeModelId bersama profile non-secret.
- [x] Simpan profile dan credential secara konsisten. Jika penyimpanan profile gagal, hapus credential yang baru dibuat.
- [x] Jika connection test gagal, pertahankan input non-secret dan jangan membuat profile duplikat.
- [x] API key field kembali kosong setelah save atau failure.
- [x] Buat Change API key flow yang tidak pernah menampilkan key lama.
- [x] Redact Authorization, x-api-key, bearer, dan pola key dari AppError.

### Error UX

- [x] 401/403 menunjukkan credential bermasalah.
- [x] 404 menunjukkan final models URL dan saran memeriksa /v1.
- [x] TLS error tidak menawarkan trust-all.
- [x] Empty list tidak membuat model palsu.
- [x] Invalid JSON menunjukkan schema incompatibility.
- [x] Timeout dapat dicoba ulang.

### Verification

- [x] Fresh install tidak menghubungi AmanAI atau provider lain.
- [x] Fake endpoint Bearer berhasil.
- [x] Fake endpoint x-api-key berhasil.
- [ ] AmanAI GET /models berhasil melalui manual smoke test dengan key lokal.
- [x] API key tidak ditemukan dengan pencarian pada app-private JSON, SQLite settings, logs, atau diagnostic output.
- [ ] Relaunch membuka model selection atau chat shell tanpa meminta key ulang.

### Exit gate

Pengguna dapat memasukkan arbitrary HTTPS endpoint, menyimpan key secara aman, dan melihat model yang dikembalikan endpoint.

Catatan exit gate: tiga item belum tercentang karena memerlukan device atau key nyata, bukan karena kodenya belum ada.

### Deviations

1. Model picker belum dibangun pada fase ini. Menampilkan daftar model adalah scope Phase 3, sedangkan Phase 2 menyimpan activeModelId sebagai model pertama yang valid. Checklist "minta pengguna memilih satu model" dan verifikasi relaunch tetap terbuka sampai Phase 3 selesai.
2. Aturan scheme diperlonggar dari Phase 1. HTTPS selalu diterima, sedangkan cleartext HTTP hanya untuk host loopback pada build development. Ini dibutuhkan agar contract test menjalankan transport yang sama terhadap fake endpoint lokal. Release tetap menolak cleartext HTTP.
3. Verifikasi API key dijalankan sebagai pemeriksaan otomatis pada contract test dan unit test, belum sebagai pencarian pada data device karena build belum pernah dijalankan di device.
4. Verifikasi relaunch memerlukan device. Yang sudah diuji: percobaan connect memakai ulang credential tersimpan dan tidak pernah membaca key ke form.

### Do not build yet

Chat request, model override editor, multi-endpoint UI, atau capability probing.

## 10. Phase 3: Model catalog JSON dan model picker

Status: selesai 16 September 2026, diperbaiki 17 September 2026. npm run lint, npm run typecheck, npm run test:ci (89 test), npm run test:server (10 test), npm run test:transport (9 test), npm run test:onboarding (7 test), dan npm run test:fields (6 test) lulus. Smoke test nyata terhadap AmanAI lewat npm run smoke:models menunjukkan 40 model terbaca dengan contextWindow terisi 40/40.

Perbaikan 17 September menghapus normalisasi kedua pada hasil `discoverModels`. Sebelumnya refresh mengubah `contextWindow` yang sudah dinormalisasi kembali menjadi null. Refresh manual sekarang juga menampilkan status memuat, home memakai hierarki visual yang lebih jelas, dan tab memakai ikon native dari `expo-symbols` yang sudah terpasang.

Catatan pipeline pengujian: contract test Node mengompilasi modul produksi ke .tests-build lalu menimpa services/persistence/catalog-files.js dengan stub in-memory, karena expo-file-system adalah native module. Lapisan katalog diuji di Jest (test:ci) sebanyak 20 test, sedangkan jalur onboarding plus seed katalog diuji di Node.

Penyimpangan kecil dari rencana:

- Tombstone untuk model yang hilang memakai file history-models.json dan flag orphaned, bukan tabel history. Tabel history baru ada pada Phase 6 sebagai bagian database percakapan. Sampai saat itu tidak ada penulis file tersebut, jadi model removed belum punya metadata untuk dipertahankan.
- Model disabled tetap tampil di picker dengan badge dimatikan, bukan disembunyikan total. Ini menghindari kebingungan ketika model aktif pengguna dimatikan, dan model tetap tidak dapat dipilih sampai diaktifkan kembali.
- Coalesce refresh memakai satu repository per layar, bukan cache global lintas layar. Dua layar yang memuat katalog bersamaan dapat melakukan dua GET /models.
- Endpoint profile belum menyimpan protocol auto, jadi perbedaan cache setelah credential berubah hanya diuji lewat pemisahan per endpointId.

### Goal

Model list menjadi katalog berlapis yang tahan refresh, missing fields, dan edit pengguna.

### Dependencies added

- expo-file-system

### Steps

- [x] Buat assets/model-defaults.json versi 1 dengan daftar kosong atau hanya model yang benar-benar diverifikasi.
- [x] Jangan menebak context window dari nama model.
- [x] Buat app-private catalog-cache untuk file per endpointId.
- [x] Buat model-overrides.json dengan schemaVersion dan map endpoints.
- [x] Implementasikan zod schema untuk defaults, live snapshot, dan overrides.
- [x] Implementasikan merge satu fungsi: defaults, live, user override.
- [x] Array override mengganti array upstream.
- [x] null pada override berarti inherit.
- [x] Simpan provenance field di hasil merge memory, bukan duplikasi permanen.
- [x] Derive displayName dari ID jika kosong.
- [x] Derive vendor dari owned_by atau prefix ID hanya sebagai inferred value.
- [x] contextWindow dan maxOutputTokens tetap null jika tidak diketahui.
- [x] reasoningEfforts kosong menyembunyikan picker, bukan berarti unsupported.
- [x] Implementasikan write temp, validate, backup satu generasi, lalu rename.
- [x] Jangan menimpa last-known-good dengan response kosong atau invalid.
- [x] Pada cold start, render cache lebih dulu lalu refresh background.
- [x] Coalesce refresh yang berjalan agar hanya satu GET /models.
- [x] Cache dipisahkan per endpointId dan di-refresh setelah credential berubah.
- [x] Model yang hilang diberi unavailable tombstone untuk history.
- [x] Buat model picker dengan exact model ID dan badge metadata yang tersedia.
- [x] Pull to refresh tidak mengganti model aktif ketika stream berjalan.

### Tests

- [x] Merge precedence.
- [x] Missing, null, invalid, dan unknown.
- [x] Corrupt override memakai backup.
- [x] Empty refresh mempertahankan last-known-good.
- [x] Override bertahan setelah refresh.
- [x] Dua endpoint tidak berbagi cache.
- [x] Model removed tetap dapat dirender dari history.

### Exit gate

Restart offline masih menampilkan katalog terakhir. Refresh online memperbarui katalog tanpa menghapus override atau selection aktif.

Terpenuhi sebagian pada level kode dan test: restart offline memakai snapshot di document directory, refresh online tidak menyentuh model-overrides.json, dan selection aktif disimpan terpisah dari katalog. Bukti pada device belum ada karena development build belum dijalankan.

### Do not build yet

Raw JSON editor, import/export, pricing dashboard, atau generic schema migration framework.

## 11. Phase 4: Vertical slice chat non-stream

Status: selesai 17 September 2026. npm run lint, npm run typecheck, npm run test:ci (97 test), npm run test:server (10 test), npm run test:responses (7 test), npm run test:transport (9 test), dan npm run test:onboarding (7 test) lulus. Android bundle berhasil dibuat. Transport smoke test mencakup `previous_response_id`; chat app memakai stateless replay karena reference docs AmanAI hanya mendokumentasikan `input` array.

### Goal

Membuktikan satu alur lengkap dari prompt sampai jawaban memakai Responses API sebelum mengerjakan streaming.

### Steps

- [x] Tambahkan tipe minimum Response request dan response item yang benar-benar dipakai.
- [x] Buat satu ResponsesClient konkret, belum perlu Transport interface.
- [x] Build URL dari EndpointProfile.
- [x] Ambil key dari CredentialStore tepat sebelum request.
- [x] Kirim model exact, input user, stream false, dan max_output_tokens kecil.
- [x] Jangan kirim reasoning jika model hanya memiliki auto atau metadata unknown.
- [x] Parse output items tanpa berasumsi output[0] selalu text message.
- [x] Extract output text dan optional reasoning summary.
- [x] Simpan response ID per turn untuk audit; request chat memakai stateless replay dari history lokal.
- [x] Buat chat screen sederhana dengan FlatList, composer, Send, loading, dan error card.
- [x] User message langsung terlihat setelah Send.
- [x] Disable duplicate Send selama request aktif.
- [x] Retry hanya membuat ulang request jika request sebelumnya gagal tanpa output.
- [x] Gunakan plain Text untuk response. Markdown belum diperlukan.
- [x] Buat New chat yang membersihkan state memory.

### Tests

- [x] Request body minimal.
- [x] Text response.
- [x] Multiple output items.
- [x] Response tanpa text.
- [x] Structured provider error.
- [x] 401, 402, 403, 429, dan 5xx mapping.

### Exit gate

Satu percakapan dua turn berhasil terhadap fake endpoint dan AmanAI tanpa streaming.

Terpenuhi lewat `npm run test:responses` untuk fake endpoint dan smoke path Responses. `useChat` mengirim seluruh history lokal sebagai `input` setiap turn, sehingga recall tidak bergantung pada state remote provider.

### Do not build yet

SQLite history, markdown, tools, auto title request, atau protocol fallback.

## 12. Phase 5: Responses streaming dan cancellation

Status: implementasi dan test otomatis selesai 17 September 2026. Native transport decision gate dan exit gate Android menunggu verifikasi manual pada emulator dan device fisik.

### Goal

Jawaban muncul incremental, dapat dihentikan, dan event parser tahan fragmentasi jaringan.

### Steps

- [x] Ubah request menjadi stream true.
- [x] Gunakan expo/fetch response.body.getReader.
- [x] Implementasikan incremental UTF-8 decode dengan TextDecoder stream mode.
- [x] Buat SSE parser pure TypeScript untuk LF, CRLF, comments, multiline data, event field, dan DONE.
- [x] Parser menerima chunk Uint8Array dan mengeluarkan complete SSE frames.
- [x] Buat internal event minimum: request.started, response.created, reasoning.delta, text.delta, tool_call events, usage.updated, response.completed, response.failed, request.cancelled.
- [x] Unknown event dicatat sebagai safe diagnostic dan diabaikan.
- [x] Fragmented tool argument disimpan tetapi belum dieksekusi.
- [x] Batch UI delta sekitar 50 ms.
- [x] Catat requestStart, firstEvent, firstVisibleToken, dan completed dengan performance.now.
- [x] Stop memanggil AbortController.abort.
- [x] Partial output tetap tampil setelah stop atau disconnect.
- [x] Retry otomatis hanya sebelum event model pertama.
- [x] Setelah event pertama, error menjadi partial response, bukan auto-retry.
- [x] Pastikan hanya satu active request per conversation.

### Native transport decision gate

Jalankan contract test pada sekurangnya satu emulator dan satu device fisik:

- chunk sampai incremental, bukan seluruh body di akhir;
- AbortController menutup request cepat;
- response headers dan status tersedia;
- timestamp antar chunk cukup untuk TPS;
- app tidak crash pada stream panjang.

Jika semua lulus, jangan membuat Kotlin module. Jika salah satu gagal secara konsisten, tulis ADR singkat berisi bukti lalu buat StreamHttpModule paling kecil yang hanya menutup gap tersebut.

### Tests

- [x] Chunk membelah UTF-8 multibyte.
- [x] Chunk membelah JSON.
- [x] Heartbeat.
- [x] Unknown event.
- [x] Abrupt EOF.
- [x] Error body non-SSE.
- [x] Cancel sebelum first token.
- [x] Cancel setelah partial text.
- [x] Usage hanya muncul pada event akhir.

### Exit gate

Streaming, stop, partial state, dan error dapat didemonstrasikan pada Android. Native module tidak ada kecuali gate membuktikannya perlu.

Menunggu laporan verifikasi manual Android. Test contract Node dan smoke AmanAI membuktikan streaming incremental, cancellation, partial state, error, timing, dan chaining, tetapi tidak menggantikan gate emulator dan device fisik.

## 13. Phase 6: SQLite conversation, history, dan recovery

Status: implementasi dan test otomatis selesai 17 September 2026. Exit gate process-kill Android menunggu verifikasi manual.

### Goal

Conversation bertahan setelah process death dan dapat dikelola tanpa menyimpan seluruh transcript di global state.

### Steps

- [x] Buat migration version 1 dengan tables conversations, turns, items, usage, timing.
- [x] Aktifkan PRAGMA journal_mode=WAL dan PRAGMA foreign_keys=ON.
- [x] Gunakan prepared parameters untuk semua user/provider content.
- [x] Gunakan withExclusiveTransactionAsync untuk write batch yang harus atomic.
- [x] Jangan menambahkan ORM.
- [x] Buat repository methods yang dipakai screen saat ini saja.
- [x] Persist user turn sebelum network request.
- [x] Persist assistant placeholder dengan status sending.
- [x] Flush streaming text ke database per UI batch, bukan per token.
- [x] Persist response ID, model ID, endpoint ID, reasoning setting, dan output ceiling per turn.
- [x] Pada app start, ubah status sending atau streaming lama menjadi interrupted.
- [x] Buat history screen dengan pagination.
- [x] Buat New chat, rename, delete dengan confirmation, dan retry last turn.
- [x] Auto title memakai potongan prompt pertama. Jangan membuat request LLM tambahan.
- [x] Tambahkan react-native-markdown-display untuk completed response.
- [x] Render streaming text sederhana jika markdown reparse menyebabkan jank.
- [x] Gunakan FlatList, bukan list library baru.
- [x] Simpan draft composer per conversation di kv-store jika kehilangan draft terbukti mengganggu. Tidak dibangun karena kebutuhan kondisional belum terbukti.

### Tests

- [x] Migration dari database kosong.
- [x] Foreign key dan cascade delete.
- [x] Partial stream tersimpan.
- [x] Process restart menandai interrupted.
- [x] Delete membersihkan turns, items, usage, dan timing.
- [x] Pagination stabil dengan sort updatedAt dan ID.

### Exit gate

Kill app di tengah stream, buka kembali, dan pastikan partial response serta status interrupted muncul. History tidak hilang.

Menunggu laporan verifikasi manual Android. Contract test SQLite membuktikan recovery partial response menjadi interrupted dan history tetap ada setelah repository dibuka ulang.

### Do not build yet

Branching conversation, full-text search, SQLCipher, cloud sync, atau semantic memory.

## 14. Phase 7: Model controls dan editable JSON

Status: implementasi dan test otomatis selesai 17 September 2026. Exit gate Android menunggu verifikasi manual.

### Goal

Pengguna dapat mengontrol reasoning, output limit, dan metadata model tanpa refresh menimpa edit.

### Dependencies added

- expo-document-picker untuk import
- expo-sharing untuk export melalui Android share sheet atau Save to Files target

### Steps

- [x] Buat model detail screen yang menampilkan value dan provenance.
- [x] Reasoning picker di detail model dan chat hanya muncul jika reasoningEfforts memiliki pilihan bermakna.
- [x] Pertahankan urutan reasoning effort dari provider.
- [x] Auto berarti omit field kecuali endpoint override menyatakan literal auto.
- [x] Hitung effectiveMaxOutput dari model limit dan protocol cap.
- [x] Output limit UI memiliki Auto dan angka explicit yang tervalidasi.
- [x] Request assembler memakai model config snapshot pada awal request.
- [x] Buat override form untuk displayName, enabled, contextWindow, maxOutputTokens, reasoningEfforts, modalities, dan capability tri-state.
- [x] Buat Add custom model dengan exact ID.
- [x] Buat Reset field dan Reset model.
- [x] Buat raw JSON editor memakai multiline TextInput. Jangan menambahkan code editor package.
- [x] Parse dan validate di memory sebelum save.
- [x] Tampilkan validation path dan message.
- [x] Tampilkan preview perubahan model yang terkena.
- [x] Backup override sebelum replace.
- [x] Import hanya menerima schemaVersion yang didukung.
- [x] Export tidak membawa credential.
- [x] Future schemaVersion ditolak dengan pesan upgrade app.
- [x] Jangan membangun migration registry sebelum schema version 2 benar-benar ada.

### Tests

- [x] Invalid number, negative token, duplicate model ID, dan invalid effort.
- [x] null kembali inherit.
- [x] Array mengganti upstream.
- [x] Save atomic.
- [x] Import corrupt tidak merusak file aktif.
- [x] Export tidak mengandung key.

### Exit gate

Pengguna dapat memperbaiki context window model unknown, restart app, refresh katalog, dan override tetap berlaku.

Menunggu laporan verifikasi manual Android. Test repository membuktikan override context window bertahan setelah repository dibuka ulang dan refresh katalog.

## 15. Phase 8: Usage normalization dan metrics footer

Status: implementasi dan test otomatis selesai 17 September 2026. `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run test:conversations`, `npm run test:responses`, dan `npm run test:server` lulus. Verifikasi manual Android untuk footer masih menunggu.

### Goal

Menampilkan TTFT, TPS, token, dan cache hit tanpa angka palsu.

### Steps

- [x] Tambahkan normalized Usage type dengan nullable buckets dan quality.
- [x] Parse Responses input_tokens, cached_tokens, cache_write_tokens, output_tokens, dan reasoning_tokens.
- [x] Kenali provider extension yang sudah ada di fixture.
- [x] Pastikan cached token subset tidak ditambahkan dua kali ke aggregate input.
- [x] Hitung TTFT dari request dispatch ke first model event.
- [x] Catat first visible token terpisah.
- [x] Hitung decode duration dari first output token ke completed.
- [x] Hitung TPS dari provider-reported output tokens.
- [x] Jangan memakai estimated output token untuk final exact TPS.
- [x] Hitung cache hit hanya jika denominator dapat dipertanggungjawabkan.
- [x] Jika cache field tidak ada, tampilkan unavailable, bukan 0%.
- [x] Pertahankan history append-only dan kirim `prompt_cache_key` stabil per conversation.
- [x] Persist usage dan timing per turn.
- [x] Tambahkan compact stats footer.
- [x] Tap footer membuka detail per-turn dan session cumulative.
- [x] Label exact, estimated, provider-reported, atau unavailable.
- [x] Jangan menambahkan pricing atau cost pada fase ini.

### Tests

- [x] Exact TPS formula.
- [x] Zero-duration guard.
- [x] Missing first token.
- [x] Cached subset.
- [x] Cache read/write/uncached buckets.
- [x] Missing usage.
- [x] Reasoning token subset.
- [x] Responses body mengirim cache key hanya saat tersedia.

### Exit gate

Fixture metrics cocok dengan formula manual dan tidak ada cache 0% palsu. Footer tetap menunggu verifikasi manual Android; cache provider tetap `unavailable` bila endpoint tidak mengirim field cache.

## 16. Phase 9: Context meter

Status: implementasi dan test otomatis selesai 18 September 2026. `npm run lint`, `npm run typecheck`, dan test terkait context lulus. Verifikasi manual Android untuk perubahan pill sebelum send masih menunggu.

### Goal

Pengguna melihat berapa context budget yang dipakai dan berapa yang tersisa sebelum send.

### Steps

- [x] Tambahkan ContextBudget input dan result sebagai pure domain types.
- [x] Effective input hanya menghitung payload yang benar-benar akan dikirim.
- [x] Jangan memakai cumulative session usage sebagai occupancy.
- [x] Provider usage terakhir menjadi calibration hint, bukan otomatis occupancy request berikutnya.
- [x] Untuk preflight estimate, hitung UTF-8 bytes dari serialized text dan gunakan pembagi konservatif awal 3.
- [x] Tambahkan overhead kecil per message/item yang dapat disetel melalui constant code.
- [x] Label hasil estimated.
- [x] Belum ada capability input-token-count yang kompatibel; tidak dilakukan probing billable.
- [x] requestedOutputReserve memakai explicit output limit atau appAutoOutputBudget 4096.
- [x] Clamp reserve ke effectiveMaxOutput jika diketahui.
- [x] Safety margin: min 8192 dan max 1024 atau 2% context.
- [x] Hitung prospective used, remaining tokens, used percent, dan remaining percent.
- [x] Jika contextWindow unknown, jangan tampilkan persentase.
- [x] Tambahkan context pill dengan used, left, token remaining, reserve, margin, dan quality.
- [x] Gunakan warna sebagai tambahan, bukan satu-satunya indikator.
- [x] Update estimate saat draft berubah dengan debounce.

### Tests

- [x] Known context.
- [x] Unknown context.
- [x] Explicit output limit.
- [x] Unknown max output.
- [x] Clamp 0 sampai 100.
- [x] Multi-byte text.
- [x] Safety margin pada context kecil dan besar.

### Exit gate

Context pill berubah sebelum send, detail rumus dapat diperiksa, dan model unknown tidak menampilkan persentase buatan. Implementasi serta test pure/component lulus; demonstrasi Android masih menunggu.

## 17. Phase 10: Local auto-compact

Status: implementasi dan test otomatis selesai 18 September 2026. Migration, local summary, preflight, manual compact, toggle, hard stop, dan replay sudah terpasang; verifikasi Android pada exit gate masih menunggu.

### Goal

Long conversation dapat berlanjut tanpa menghapus transcript asli atau melakukan silent truncation.

### Steps

- [x] Tambahkan compactions table melalui migration version 2.
- [x] Tambahkan contextPolicy ke normalized model config.
- [x] Default trigger 80, target 55, hard stop 95, minimum recent turns 4.
- [x] Validate target < trigger < hard stop.
- [x] Preflight compaction berjalan sebelum main request ketika prospective use mencapai trigger.
- [x] Jangan compact saat stream aktif. Schema tool transaction belum ada pada MVP ini.
- [x] Pilih prefix berdasarkan complete turn boundary.
- [x] Pertahankan instructions dan recent turns. Pinned facts, attachment references, dan tool pairs belum memiliki persistence pada MVP ini.
- [x] Buat compaction prompt versioned yang meminta structured JSON summary.
- [x] Validate summary dengan zod.
- [x] Summary fields: user goals, constraints, decisions, facts, artifacts, completed actions, tool results, open questions, next steps, dan untrusted content notes.
- [x] Simpan source turn range, model, prompt version, usage, before/after estimate, status, dan summary.
- [x] Original turns tidak diubah atau dihapus.
- [x] Effective context builder memakai summary sebagai user/data context, bukan system instruction.
- [x] Setelah local compaction, gunakan stateless replay untuk effective context baru.
- [x] Hitung ulang occupancy dan compact chunk berikutnya jika masih di atas target dan prefix lengkap masih tersedia.
- [x] Satu conversation hanya memiliki satu compaction job aktif.
- [x] Retry compaction paling banyak sekali jika belum ada output.
- [x] Di hard stop, block unsafe send dan tampilkan Compact now, Start new chat, atau Reduce output reserve.
- [x] Tambahkan separator compaction ringan di transcript.
- [x] Tambahkan manual Compact now dan Auto-compact toggle per conversation.
- [x] Catat usage compaction terpisah dari chat usage.

### Security rules

- [x] External web/tool text tetap ditandai untrusted di summary.
- [x] Summary tidak boleh menaikkan privilege instruksi.
- [x] Native /responses/compact belum dipakai.
- [x] Tidak ada emergency sliding-window truncation pada MVP.

### Tests

- [x] Trigger dan hysteresis.
- [x] Complete turn selection tidak memisahkan unit turn. Tool call/result belum ada di persistence MVP.
- [x] Summary invalid.
- [x] Summary masih terlalu besar ditahan oleh hard stop bila occupancy tetap tinggi.
- [x] Interrupted compaction tidak menjadi active.
- [x] Transcript asli tetap lengkap.
- [x] Hard stop tidak mengirim main request.

### Exit gate

Fixture long conversation otomatis compact, occupancy turun di bawah target saat prefix cukup, transcript tetap utuh, dan request berikutnya berhasil. Test otomatis lulus; demonstrasi Android masih menunggu.

## 18. Phase 11: MVP hardening dan internal release

Status: selesai 18 September 2026. Implementasi, agent checks, verifikasi manual Android, Maestro/E2E, AmanAI smoke, dan internal build dikonfirmasi lulus oleh pemilik proyek.

### Goal

Menutup MVP yang aman, accessible, dapat diuji ulang, dan dapat dipasang sebagai APK internal.

### UX steps

- [x] Terapkan design tokens kecil untuk color, spacing, radius, typography, dan dark mode.
- [x] Gunakan core components. Jangan membuat design system package.
- [x] Touch target minimum 48 dp pada kontrol MVP.
- [x] Tambahkan accessibilityLabel dan accessibilityHint pada composer, model picker, stop, retry, stats, dan context.
- [x] Uji font scale besar.
- [x] Pastikan keyboard tidak menutupi composer.
- [x] Pastikan long markdown tidak membuat composer lag.
- [x] Link eksternal meminta confirmation atau membuka browser sistem.
- [x] Error card menampilkan endpoint name, model, protocol, status, provider code, request ID, dan safe next action.

### Security steps

- [x] Release build menolak cleartext HTTP.
- [x] Tidak ada trust-all certificate path.
- [x] Redirect POST dinonaktifkan atau divalidasi.
- [x] Secret redaction dites.
- [x] Android backup mengecualikan credential dan sensitive cache.
- [x] Chat backup default off.
- [x] Debug body logging default off.
- [x] Clear all data menghapus SQLite, model cache, overrides, exported temp files, dan SecureStore records.
- [x] Diagnostic export tidak membawa content atau credential secara default.

### Reliability steps

- [x] Implementasikan retry maksimum 2 hanya untuk pre-output network error dan 429/502/503.
- [x] Hormati Retry-After.
- [x] Model refresh concurrent di-coalesce.
- [x] Set error body cap 256 KB.
- [x] Set local diagnostic ring 2 MB.
- [x] Uji offline start, network switch, rotation, low memory restart, dan process kill.

### Automated checks

- [x] Tambahkan Maestro only now.
- [x] E2E: first-run setup, model discover, send stream, stop, restart recovery, override, context meter.
- [x] CI untuk npm ci, lint, typecheck, test:ci, expo-doctor, dan Android debug build ditunda sesuai keputusan pemilik proyek.
- [x] Jangan menambahkan snapshot tests besar.
- [x] Build internal APK/AAB dari clean checkout.

### MVP release gate

Semua kondisi berikut wajib:

- [x] FR-001 sampai FR-015 lulus.
- [x] Fake endpoint test suite lulus.
- [x] AmanAI models, non-stream, dan stream smoke test lulus.
- [x] API key tidak muncul di files, logs, database, backup, atau exported config.
- [x] Cold start offline berfungsi.
- [x] Stop dan process recovery berfungsi.
- [x] Metrics dan context tidak menampilkan angka palsu.
- [x] Auto-compact tidak menghapus transcript.
- [x] Signed internal build dapat dipasang pada device Android target.

MVP selesai di sini. Jangan memulai P1 untuk menutupi defect MVP.

## 19. Phase 12: Chat Completions adapter dan protocol auto

### Goal

Mendukung endpoint OpenAI-compatible yang tidak memiliki Responses API.

### Steps

- [x] Baru sekarang extract transport contract karena implementasi kedua benar-benar ada.
- [x] Contract menerima canonical request dan menghasilkan internal events yang sama.
- [x] Refactor ResponsesClient menjadi ResponsesTransport tanpa mengubah behavior.
- [x] Implementasikan ChatCompletionsTransport.
- [x] Map instructions ke system message.
- [x] Map user/assistant history ke messages.
- [x] Map max output ke field endpoint profile.
- [x] Kirim reasoning_effort hanya jika profile menyatakan support.
- [x] Parse data chunks dan DONE.
- [x] Parse tool_calls delta tetapi belum mengubah policy tool.
- [x] Normalisasi prompt/completion usage.
- [x] Aktifkan protocol option Responses, Chat Completions, dan Auto.
- [x] Auto mencoba Responses pada first chat request.
- [x] Fallback hanya pada 404, 405, atau 501 sebelum output.
- [x] Jangan fallback pada 400, auth, billing, rate limit, atau setelah partial output.
- [x] Cache protocol yang berhasil per endpoint, dengan Reset compatibility action.
- [x] Jangan melakukan probe billable saat setup.

### Tests

- [x] Kedua adapter menghasilkan internal event sequence ekuivalen.
- [x] Auto fallback only allowed statuses.
- [x] No duplicate request after partial output.
- [x] Endpoint-specific max token field.
- [x] Chat cached token variants.

### Exit gate

Fake endpoint Responses-only, Chat-only, dan dual-protocol semuanya berhasil dengan protocol behavior yang dapat didiagnosis.

Status: Phase 12 completed on 18 September 2026. `npm run typecheck`, `npx eslint .`, `npm run test:ci`, all relevant contract tests, and the fake endpoint exit gate passed.

## 20. Phase 13: Function tool loop

### Goal

Model dapat memanggil function tool dengan approval dan bounded loop.

### Steps

- [x] Baru sekarang tambahkan ToolDefinition, ToolCall, ToolResult, ToolPolicy, ToolRegistry, dan AgentLoop.
- [x] Registry hanya berisi tool yang benar-benar diimplementasikan.
- [x] Validasi tool name dan JSON arguments.
- [x] Unknown tool menghasilkan structured error result, bukan crash.
- [x] Risk levels: read-only, write, dangerous.
- [x] Approval: never, ask, always.
- [x] Default deny untuk tool unknown.
- [x] Write dan dangerous selalu ask.
- [x] Approval screen menampilkan tool, arguments, target, dan side effect.
- [x] Approval berlaku satu call.
- [x] Batasi 8 tool rounds dan 3 parallel read-only calls.
- [x] Tambahkan timeout, cancellation, output byte cap, dan total wall-clock cap.
- [x] Dedupe call ID agar resume tidak mengulang side effect.
- [x] Persist tool call, approval, result, dan status.
- [x] Tambahkan satu deterministic read-only demo tool untuk test, misalnya get_current_time dengan timezone input.
- [x] Kirim tool result kembali ke transport sampai final answer.
- [x] Jangan menyediakan shell tool.

### Tests

- [x] Fragmented arguments.
- [x] Invalid JSON.
- [x] Unknown tool.
- [x] Approval reject.
- [x] Timeout.
- [x] Duplicate call ID.
- [x] Round limit.
- [x] Parallel read-only.
- [x] Cancellation propagation.

### Exit gate

Model dapat memanggil demo tool, pengguna melihat progress, dan loop berhenti aman pada final answer atau limit.

Status: Phase 13 completed on 18 September 2026. `npm run typecheck`, `npx eslint .`, `npm run test:ci`, and relevant Responses, Chat Completions, protocol, and SQLite contract tests passed.

## 21. Phase 14: Web search dan safe fetch

### Goal

Menambahkan current-information tool tanpa memberikan network authority yang tidak terbatas.

### Entry gate

Pemilik proyek harus memilih:

- search API;
- siapa pemilik key;
- quota dan error contract;
- apakah hasil search sudah berisi snippet yang cukup;
- apakah URL fetch harus dilakukan client, search backend, atau sandbox backend.

Jika belum ada keputusan, phase berhenti di sini. Jangan membuat provider abstraction kosong.

Keputusan pemilik proyek:

- Aplikasi memakai private Search Gateway yang dikonfigurasi pengguna dengan URL HTTPS dan bearer token.
- Pengguna memilih SearXNG engine di Settings. Nilai default `bing` dikirim sebagai parameter `engines` pada setiap search dan tidak dapat diubah model.
- Pengguna dapat memilih private Search Gateway atau Exa direct untuk `web_search`. Exa memakai `POST https://api.exa.ai/search` dan API key dari SecureStore.
- Exa dan private Search Gateway menangani `web_search`. `web_fetch` memakai Firecrawl Keyless melalui `POST https://api.firecrawl.dev/v2/scrape`, tanpa API key. Tidak ada test request Exa karena search dapat billable.
- Gateway menangani authentication dan limit input untuk search. Firecrawl mengambil serta mengekstrak halaman; aplikasi tidak menghubungi SearXNG atau URL hasil secara langsung.
- Token disimpan di SecureStore. URL, status enabled, dan token tidak pernah dimasukkan ke model context, diagnostics, atau tool output.
- Tool menerima maksimal 10 hasil, raw response dibatasi 64 KB, output model 12 KB, dan tidak melakukan retry sendiri.
- Error HTTP, rate limit, timeout, dan response invalid dikirim kembali sebagai structured tool error tanpa detail provider.

### Web search steps

- [x] Implementasikan client private Search Gateway konkret tanpa provider abstraction.
- [x] Simpan URL HTTPS dan status enabled di storage aplikasi, serta bearer token di SecureStore.
- [x] Simpan SearXNG engine pada Settings dengan default `bing` dan migrasikan setting gateway lama ke nilai default itu.
- [x] Tambahkan pilihan Exa direct untuk `web_search`, dengan API key terpisah di SecureStore.
- [x] Tool input gateway: query, count maksimal 10, time_range, language, dan categories optional. Exa menerima query, count, dan time_range; filter gateway ditolak, tidak diabaikan diam-diam.
- [x] Validate query length, count, time_range, language, categories, dan URL fetch.
- [x] Batasi raw response 64 KB dan output 12 KB tanpa truncation diam-diam.
- [x] Teruskan JSON respons search gateway atau Exa, serta fetch Firecrawl, secara mentah ke model tanpa parsing atau normalisasi.
- [x] Perlakukan seluruh hasil sebagai untrusted external content; UI hanya membaca field source card yang diperlukan.
- [x] Tampilkan source cards di UI.
- [x] Tetapkan `web_search` dan `web_fetch` read-only dengan approval `ask`; hasil tidak dapat mengubah policy.
- [x] Persist query metadata dan result summary melalui audit `tool_calls`, tanpa secret.
- [x] Tambahkan Web Tools settings, test connection `GET /health` untuk gateway search, dan source card untuk hasil fetch.

### web_fetch decision

expo/fetch tidak memberi aplikasi kontrol penuh atas DNS resolution dan redirect IP validation. Karena itu aplikasi tidak melakukan fetch langsung ke URL tujuan:

- [x] `web_fetch` hanya memanggil `POST https://api.firecrawl.dev/v2/scrape` dengan URL HTTP(S), format Markdown, dan tanpa credential. Firecrawl Keyless menjadi service fetch tepercaya.
- [x] Aplikasi tidak mengklaim JS-only fetch sebagai SSRF-safe dan tidak membuat generic HTTP proxy.
- [x] `web_fetch` hanya menerima URL HTTP(S), tidak meneruskan token, dan mengembalikan text sebagai untrusted data.
- [x] Aplikasi tidak menghubungi SearXNG, Jina Reader, atau tujuan fetch secara langsung.

### Exit gate

Search bekerja melalui gateway atau Exa, fetch melalui Firecrawl Keyless, hasil memiliki source, output dibatasi, dan prompt injection tidak dapat melewati tool policy.

Status: Phase 14 extended on 20 September 2026. Gateway and Exa search plus Firecrawl Keyless fetch passed `npm run typecheck`, `npx eslint .`, `npm run test:ci`, and `npm run test:web-tools`. Android verification remains manual.

## 22. Phase 15: Image dan file attachment

### Goal

Mengirim attachment hanya ke model dan protocol yang menyatakan dukungan.

### Dependencies added

- expo-image-picker
- expo-document-picker
- expo-file-system jika belum tersedia

### Steps

- [x] Allowlist PNG, JPEG, WebP; max 8 MB per image, 12 MB per message, empat image.
- [x] Gunakan content URI dan copy file terpilih ke app-private staging.
- [x] File di atas batas ditolak sebelum dibaca ke JS; data URL bounded dibuat sekali pada batas send Responses.
- [x] Attachment composer hanya aktif jika modality model supported.
- [x] Unknown modality membutuhkan explicit user override lewat metadata model.
- [x] Buat provider mapping image `input_image` pada Responses.
- [x] Jangan mengasumsikan upload endpoint universal.
- [x] Generic file upload incompatible ditandai unsupported dengan tidak menyediakan composer atau adapter file.
- [x] Tidak ada endpoint upload, jadi tidak ada progress upload semu.
- [x] Hapus staging file saat new chat, cleanup startup, clear-all, dan delete conversation.
- [x] Delete conversation menghapus attachment yang tidak direferensikan.
- [x] Jangan mendukung video pada implementasi pertama.

### Tests

- [x] Unsupported modality.
- [x] File terlalu besar.
- [x] MIME tidak diizinkan.
- [x] Permission ditolak.
- [x] Process restart saat staging.
- [x] Delete cleanup.

### Exit gate

Satu image flow yang didukung endpoint berhasil tanpa memory spike dan model text-only tidak menampilkan attachment control.

Status: Implementasi dan test otomatis selesai 20 September 2026. `npm run typecheck`, `npx eslint .`, `npm run test:ci`, `npm run test:conversations`, dan `npm run test:responses` lulus. Verifikasi Android endpoint nyata dan memory masih menunggu pemilik proyek.

## 23. Phase 16: Background generation

### Goal

Stream dapat berlanjut saat app di-background-kan melalui Android foreground service.

### Entry gate

Implementasikan hanya jika penggunaan nyata menunjukkan foreground-only tidak cukup.

### Steps

- [ ] Buat local Expo Module khusus Android untuk foreground generation.
- [ ] Service dimulai akibat direct user action.
- [ ] Notification menampilkan endpoint name, model, status, dan Cancel.
- [ ] Jangan tampilkan prompt atau response content pada lock screen secara default.
- [ ] Network request dimiliki service atau memiliki bridge lifecycle yang tidak mati bersama screen.
- [ ] Event tetap dipersist ke SQLite.
- [ ] Cancel notification membatalkan request dan menandai turn cancelled.
- [ ] Tangani Android version restrictions dan service timeout.
- [ ] Jangan gunakan WorkManager untuk interactive stream.
- [ ] Jika OS membunuh service, tandai interrupted.

### Exit gate

Background, screen-off, cancel notification, process recreation, dan battery restriction scenarios diuji pada versi Android minimum dan terbaru.

## 24. Phase 17: P1 completion

### Goal

Menutup fitur portability dan endpoint management setelah chat, tools, dan attachment stabil.

### Steps

- [ ] Tambahkan multi-endpoint profile list dan endpoint switcher.
- [ ] Satu conversation tetap terikat ke endpointId dan modelId snapshot.
- [ ] Switching endpoint tidak mengubah active stream.
- [ ] Credential terpisah per profile.
- [ ] Import/export endpoint config tidak membawa credential.
- [ ] Export conversation membawa transcript, tool audit, usage, dan readable compaction summary.
- [ ] Import conversation memvalidasi schema dan menghasilkan ID baru.
- [ ] Tambahkan usage screen hanya jika endpoint profile memiliki documented usage path.
- [ ] AmanAI profile boleh memakai /usage.
- [ ] Endpoint lain tidak menampilkan usage screen palsu.
- [ ] Tambahkan model cache cleanup untuk endpoint yang dihapus.
- [ ] Delete endpoint meminta kebijakan untuk conversation terkait: keep read-only atau delete.

### P1 release gate

- [ ] Chat Completions fallback stabil.
- [ ] Tool loop stabil.
- [ ] Web search stabil.
- [ ] Attachment yang didukung stabil.
- [ ] Background behavior sesuai keputusan produk.
- [ ] Multi-endpoint data tidak tercampur.
- [ ] Export tidak mengandung secret.

## 25. Phase 18: Command execution threat-model gate

### Goal

Memutuskan apakah command execution benar-benar diperlukan dan boundary mana yang dapat diterima.

### Steps

- [ ] Tulis use cases konkret. Contoh command generik tidak cukup.
- [ ] Klasifikasikan data yang boleh masuk workspace.
- [ ] Tentukan apakah network diperlukan.
- [ ] Tentukan apakah command harus tetap berjalan saat app tutup.
- [ ] Tentukan distribution channel karena Termux integration dapat memengaruhi Play Store path.
- [ ] Bandingkan no-shell narrow tools, Termux, dan remote sandbox.
- [ ] Buat satu proof of concept read-only tanpa model control.
- [ ] Uji isolation, timeout, output cap, cancel, dan data leakage.
- [ ] Dokumentasikan enforcement yang benar-benar tersedia.
- [ ] Pilih satu backend pertama.

### Exit outcomes

- No-go: command execution tetap disabled.
- Termux: lanjut Phase 19.
- Remote: lanjut Phase 20.
- Keduanya: implementasikan satu dulu, stabilkan, baru implementasi kedua.

Jangan membuat CommandExecutor abstraction sebelum backend pertama disetujui. Extract interface saat backend kedua benar-benar mulai.

## 26. Phase 19: Termux bridge

### Goal

Power user dapat menjalankan command melalui Termux dengan separation yang jelas, bukan klaim container sandbox.

### Steps

- [ ] Buat local Expo Module Kotlin untuk RUN_COMMAND Intent.
- [ ] Tambahkan permission dan package visibility minimum.
- [ ] Verifikasi package/signature jika feasible.
- [ ] Buat onboarding yang menjelaskan dependency, permission, dan allow-external-apps.
- [ ] Default disabled.
- [ ] Gunakan dedicated workspace yang dibagikan secara explicit.
- [ ] Jangan share database, model cache, atau credential.
- [ ] Tampilkan exact argv atau shell string sebelum approval.
- [ ] Satu active command untuk versi pertama.
- [ ] Tambahkan timeout, output cap, stop, stdout, stderr, exit code, dan truncation marker.
- [ ] Label enforcement sebagai termux-separated, bukan isolated.
- [ ] Jangan meneruskan environment aplikasi.
- [ ] Persist audit tanpa secret.
- [ ] Tidak ada automatic retry untuk command.

### Exit gate

Missing Termux, permission denied, success, timeout, cancel, large output, dan app restart semuanya memiliki state yang dapat dipahami.

## 27. Phase 20: Remote sandbox

### Goal

Menyediakan execution dengan container atau microVM boundary untuk pekerjaan serius.

### Entry gate

Phase ini membutuhkan backend terpisah, authentication design, budget, dan security review. Mobile client saja tidak cukup.

### Backend minimum

- [ ] Create/delete ephemeral sandbox.
- [ ] Submit argv command dengan idempotency key.
- [ ] Stream command events.
- [ ] Send stdin jika diperlukan.
- [ ] Non-root.
- [ ] Read-only root filesystem.
- [ ] Writable workspace terpisah.
- [ ] CPU, memory, disk, PID, time, dan output limits.
- [ ] Network default off atau allowlist.
- [ ] No host socket.
- [ ] Automatic cleanup.
- [ ] Per-user auth.
- [ ] Signed upload/download.
- [ ] Audit dan abuse limits.

### Mobile steps

- [ ] Simpan sandbox credential di SecureStore.
- [ ] Jangan mengirim LLM API key.
- [ ] Tampilkan enforcement remote-isolated hanya jika server menjaminnya.
- [ ] Resume event stream setelah network reconnect.
- [ ] Delete sandbox action tersedia.
- [ ] Handle expired sandbox dan orphan cleanup.

### Exit gate

Security review lulus dan isolation failure menghasilkan fail closed, bukan fallback ke local process.

## 28. Phase 21: Workspace dan MCP

### Goal

Menambahkan file workspace dan MCP hanya setelah satu execution backend stabil.

### Workspace steps

- [ ] Scope browser ke dedicated workspace.
- [ ] Canonicalize path.
- [ ] Blok traversal dan symlink escape.
- [ ] Preview diff sebelum write.
- [ ] Batasi file size dan archive extraction.
- [ ] Jangan expose app-private root.

### MCP steps

- [ ] Mulai dari remote HTTP MCP server, bukan arbitrary local stdio.
- [ ] Tambahkan satu server profile manual.
- [ ] Fetch tool list dan ubah menjadi ToolRegistry entries.
- [ ] Apply approval policy yang sama seperti function tools.
- [ ] Store MCP credentials di SecureStore.
- [ ] Cap tool output dan timeout.
- [ ] Tidak ada marketplace atau auto-install.

### Exit gate

Satu remote MCP server dapat dipakai tanpa melewati approval, credential, timeout, dan output limits.

## 29. Phase 22: Advanced features

### Goal

Menambahkan hanya fitur lanjutan yang sudah memiliki use case, endpoint target, dan acceptance test konkret.

Fitur di bawah tidak masuk sebelum data penggunaan membuktikan kebutuhannya.

### Native Responses compaction

- [ ] Implementasikan hanya jika endpoint capability supported.
- [ ] Simpan opaque item tanpa parsing.
- [ ] Fallback hanya pada unsupported statuses sebelum output.
- [ ] Jangan mengganti local compaction yang sudah stabil tanpa comparative tests.

### Cost estimation

- [ ] Implementasikan hanya jika pricing unit dan currency dapat dinormalisasi.
- [ ] Label estimate.
- [ ] Pisahkan chat, compaction, tool, dan search cost.

### Conversation branching

- [ ] Tambahkan parentTurnId hanya ketika edit-and-resend benar-benar dibutuhkan.
- [ ] Jangan menduplikasi transcript penuh.

### Voice dan realtime

- [ ] Pilih protocol setelah endpoint realtime target diketahui.
- [ ] Treat audio permission, interruption, Bluetooth, dan background as separate project slice.

### On-device compaction

- [ ] Pertimbangkan hanya setelah ukuran model, kualitas summary, latency, dan battery diuji.

### iOS

- [ ] Jangan memulai port sebelum Android MVP dan P1 stabil.
- [ ] Audit SecureStore, files, background tasks, attachments, dan native modules secara terpisah.

### Exit gate

Setiap subfitur dianggap release slice sendiri. Satu subfitur harus memiliki contract test, migration jika perlu, security review sesuai risikonya, dan tidak boleh memaksa subfitur lain ikut diimplementasikan.

## 30. Database migration plan

Jangan membuat migration framework kompleks. Gunakan integer user_version dan ordered functions.

| Version | Introduced in | Tables/change |
|---:|---|---|
| 1 | Phase 6 | conversations, turns, items, usage, timing |
| 2 | Phase 10 | compactions dan active compaction reference |
| 3 | Phase 13 | tool_calls dan approval fields |
| 4 | Phase 15 | attachments dan references |

Aturan:

- Migration berjalan dalam exclusive transaction.
- Backup database sebelum destructive migration.
- Tidak ada destructive migration pada MVP.
- Fresh schema dan migrated schema harus menghasilkan bentuk yang sama.
- Migration hanya ditulis saat version tersebut dibutuhkan.

## 31. Test matrix

### Setiap pull request

- npm run lint
- npm run typecheck
- npm run test:ci
- npx expo-doctor jika dependency berubah

### Setiap fase transport

- Fake endpoint success.
- Slow first token.
- Fragmented UTF-8 dan JSON.
- Abrupt disconnect.
- Auth, billing, rate limit, upstream error.
- Cancel.

### Setiap fase persistence

- Fresh install.
- Upgrade migration.
- Process kill.
- Corrupt JSON.
- Low storage behavior.

### Sebelum MVP release

- Android API 26 emulator atau device.
- Android 10.
- Android 12 atau lebih baru.
- Latest available Android target.
- Wi-Fi ke mobile transition.
- Offline cold start.
- Font scale besar.
- Dark mode.
- Long conversation.
- Long markdown.
- AmanAI real smoke tests dengan low output limit.

### Secret scanning

Search build logs, source tree, exported config, SQLite dump, model JSON, and diagnostic export for:

- Authorization
- x-api-key
- bearer
- sk-
- known test key value

Gunakan hanya fake key pada automated tests.

## 32. Requirement traceability

| Requirement | Phase |
|---|---:|
| FR-001 Custom endpoint onboarding | 2 |
| FR-002 Secure credential | 2, 11 |
| FR-003 Automatic model discovery | 2, 3 |
| FR-004 Model metadata | 3 |
| FR-005 JSON override | 7 |
| FR-006 Missing-field fallback | 3 |
| FR-007 Responses streaming | 5 |
| FR-008 Conversation | 6 |
| FR-009 Reasoning picker | 7 |
| FR-010 Output limit | 7 |
| FR-011 Stats footer | 8 |
| FR-012 Recovery | 6 |
| FR-013 Diagnostics | 2, 11 |
| FR-014 Context meter | 9 |
| FR-015 Auto-compact | 10 |
| FR-101 Chat Completions | 12 |
| FR-102 Function tool loop | 13 |
| FR-103 Web search | 14 |
| FR-104 Safe fetch URL | 14, conditional |
| FR-105 Tool approval | 13 |
| FR-106 Attachment | 15 |
| FR-107 Foreground generation | 16, conditional |
| FR-108 Usage screen | 17 |
| FR-109 Export/import | 7, 17 |
| FR-110 Multi-endpoint | 17 |
| FR-201 Termux | 19, conditional |
| FR-202 Remote sandbox | 20, conditional |
| FR-203 Workspace | 21 |
| FR-204 MCP | 21 |
| FR-205 Cost | 22 |
| FR-206 Branching | 22 |
| FR-207 Voice/realtime | 22 |

## 33. Definition of done

Sebuah phase hanya selesai jika:

- scope phase bekerja pada Android;
- tests phase lulus;
- lint dan typecheck lulus;
- error path utama diuji;
- secret tidak masuk log atau storage yang salah;
- dokumentasi behavior yang berubah diperbarui;
- tidak ada TODO yang sebenarnya requirement phase aktif;
- tidak ada dependency atau abstraction untuk phase masa depan;
- exit gate dapat didemonstrasikan dari clean install atau migrated install.

Project dianggap MVP selesai setelah Phase 11. Project dianggap P1 selesai setelah Phase 17. Phase 18 dan seterusnya adalah keputusan produk terpisah, bukan alasan menunda MVP.

## 34. Sumber teknis untuk executor

- Requirement research: RESEARCH_REACT_NATIVE_ANDROID_LLM_CLIENT.md
- Expo SDK compatibility: https://docs.expo.dev/versions/latest/
- Expo Router: https://docs.expo.dev/router/introduction/
- Expo streaming fetch: https://docs.expo.dev/versions/latest/sdk/expo/
- Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
- Expo Jest setup: https://docs.expo.dev/develop/unit-testing/
- React Native New Architecture: https://reactnative.dev/architecture/landing-page
- OpenAI Models baseline: https://developers.openai.com/api/reference/ruby/resources/models
- OpenAI Responses create: https://developers.openai.com/api/reference/cli/resources/responses/methods/create
- OpenAI Responses compact: https://developers.openai.com/api/reference/java/resources/responses/methods/compact
- AmanAI API reference: https://ai.amanai.dev/docs/reference/
- AmanAI models: https://ai.amanai.dev/docs/models/
- Exa Search: https://exa.ai/docs/reference/search

Jika dokumentasi library berubah saat executor mulai, pilih stable release yang saling kompatibel, update lockfile, dan catat versi aktual. Jangan pindah ke beta atau canary hanya untuk mendapatkan fitur yang belum diperlukan.

## 35. Peta codebase dan prompt pembaruannya

Peta struktur folder dan tanggung jawab berkas tinggal di `docs/CODEBASE.md`. Dokumen itu adalah indeks navigasi, bukan pengganti PLAN.md: PLAN.md memuat kontrak fase, CODEBASE.md memuat keadaan isi repository.

Aturan pemakaian:

- Baca `docs/CODEBASE.md` sebelum menjelajah repository untuk mencari tempat sebuah perubahan.
- Perbarui `docs/CODEBASE.md` pada commit yang sama dengan setiap perubahan struktur, penambahan berkas, atau perubahan tanggung jawab berkas.
- Jangan menambahkan fase atau requirement baru ke CODEBASE.md. Requirement tetap hanya di PLAN.md.
- Jangan mencatat versi dependency di CODEBASE.md. Sumbernya adalah package.json dan bagian Generated toolchain README.md.

### Prompt untuk mengubah markdown peta codebase

Pakai prompt berikut apa adanya saat peta perlu disegarkan. Salin, ganti bagian dalam tanda kurung, lalu jalankan.

~~~text
Perbarui docs/CODEBASE.md supaya cocok dengan keadaan repository saat ini.

Konteks perubahan: (tulis fase atau PR yang baru selesai, misalnya "Phase 4 chat non-stream").

Langkah:

1. Daftar berkas nyata dengan: find app src tools assets -type f | sort
2. Bandingkan dengan bagian 2 Struktur folder pada docs/CODEBASE.md.
3. Untuk setiap berkas yang ditambah, dihapus, atau dipindah, perbarui bagian 2.
4. Untuk setiap berkas dengan tanggung jawab baru, perbarui tabel di bagian 3. Sebutkan nama export utama dan layer yang diimpor, bukan ringkasan naratif.
5. Perbarui bagian 4 Alur yang sudah berjalan jika alur runtime berubah.
6. Pindahkan atau hapus baris di bagian 5 Yang belum ada jika fasenya sudah selesai.
7. Perbarui baris Status di kepala dokumen dengan fase yang sedang berjalan.

Batasan:

- Jangan menyentuh PLAN.md, README.md, atau source code pada perubahan ini.
- Jangan mencatat versi dependency, jumlah test, atau jumlah baris.
- Jangan menambahkan fase, requirement, atau rencana baru.
- Jangan membuat folder utils atau barrel index.ts.
- Pertahankan bahasa Indonesia dan gaya tabel yang sudah ada.
- Jangan memakai em dash.

Verifikasi:

- Setiap path di bagian 2 benar-benar ada, dan tidak ada berkas di app/, src/, tools/, atau assets/ yang terlewat.
- Setiap klaim di bagian 3 dapat diperiksa langsung di berkas yang disebut.
- Dokumen tetap menjelaskan repository yang sekarang, bukan rencana.

Keluarkan diff untuk docs/CODEBASE.md saja.
~~~

### Prompt review peta codebase

Pakai prompt ini untuk memeriksa peta tanpa mengubah source code.

~~~text
Periksa docs/CODEBASE.md terhadap repository saat ini dan laporkan ketidakcocokan saja.

1. Jalankan: find app src tools assets -type f | sort
2. Tandai berkas yang tidak tercantum, path yang tidak lagi ada, dan tanggung jawab yang sudah tidak sesuai.
3. Tandai klaim yang menyalin rencana, bukan keadaan sekarang.
4. Jangan perbaiki apa pun. Keluarkan daftar temuan dengan path berkas dan baris dokumen yang perlu diubah.
~~~

### Tambahan struktur saat fase bertambah

Saat fase berikutnya menambah folder baru, tambahkan juga bagiannya di CODEBASE.md mengikuti aturan layer:

- `src/domain/conversation.ts`, `src/domain/usage.ts`, `src/domain/context.ts`, dan `src/domain/tool.ts` dibuat pada fase yang benar-benar memakainya.
- Folder `src/features/chat/`, `src/features/history/`, dan `src/features/settings/` menyusul pada Phase 4, 6, dan 7.
- `src/domain/usage.ts` dibuat pada Phase 8; `src/services/metrics/` tidak dibuat karena normalizer dan formula metrics pure, sedangkan persistence tetap di `conversation-store.ts`. `src/services/context/` menyusul pada Phase 9.
- Folder `modules/` hanya dibuat setelah native feature disetujui.
