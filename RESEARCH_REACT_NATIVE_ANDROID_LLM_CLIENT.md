# Riset Requirement Aplikasi Chat LLM Android dengan Custom OpenAI-Compatible Endpoint

Status: dokumen riset untuk menjadi input implementation plan, bukan implementation plan final.

Tanggal riset: 16 September 2026.

Target awal: aplikasi Android berbasis React Native yang terasa seperti aplikasi ChatGPT, memakai endpoint OpenAI-compatible milik pengguna, memuat katalog model secara dinamis, mendukung reasoning, streaming, statistik token, context meter, auto-compact, tool calling, web search, dan jalur menuju command sandbox.

## 1. Ringkasan keputusan

Aplikasi ini layak dibuat sebagai generic BYOK client untuk endpoint OpenAI-compatible. AmanAI dipakai sebagai endpoint referensi, contoh dokumentasi, dan target smoke test pertama karena merupakan endpoint yang dipakai pemilik proyek. AmanAI bukan dependency wajib dan hostname-nya tidak boleh menjadi syarat runtime. AmanAI menyediakan hampir semua metadata yang dibutuhkan melalui GET /v1/models, termasuk context window, max output, reasoning level, modality, vendor, deskripsi, dan pricing. Respons live yang diperiksa pada tanggal riset berisi 40 model, dan semua entri memiliki context_length, max_output, serta thinking.

Arsitektur yang direkomendasikan:

1. Gunakan React Native dengan TypeScript dan Android native module kecil berbasis Kotlin.
2. Gunakan mode protocol auto untuk custom endpoint. Responses API menjadi pilihan utama jika didukung, sedangkan profile AmanAI dapat langsung memakai Responses karena dukungannya sudah terdokumentasi.
3. Sediakan adapter Chat Completions sebagai fallback untuk endpoint OpenAI-compatible yang belum mendukung Responses API.
4. Simpan metadata model sebagai JSON berlapis, bukan satu file yang selalu ditimpa:
   - snapshot katalog live per endpoint;
   - model-overrides.json yang dapat diedit pengguna;
   - model-defaults.json bawaan aplikasi sebagai fallback untuk model yang dikenal.
5. Urutan merge metadata: override pengguna > katalog live > default bawaan > unknown.
6. Jangan simpan API key di JSON. Simpan key di Android Keystore dan referensikan dengan credential ID.
7. Simpan percakapan dan event tool di SQLite, bukan JSON, karena membutuhkan transaksi, pagination, pencarian, dan recovery setelah proses mati.
8. Tampilkan context usage dan sisa context dalam persen. Perhitungkan input, output reservation, dan safety margin, serta beri label exact, estimated, atau unknown.
9. Jalankan auto-compact sebelum context penuh. Transkrip asli tetap utuh di SQLite, sedangkan payload ke model memakai summary terstruktur dan recent turns.
10. Hitung TPS seperti DeepSeek Harness: output token dibagi decode time, yaitu waktu dari token pertama sampai response selesai. Jangan memasukkan TTFT ke denominator TPS.
11. Hitung cache hit dari cache-read tokens dibagi seluruh prompt-side tokens yang dapat dipertanggungjawabkan. Jika provider tidak mengirim data cache, sembunyikan metrik tersebut, jangan menampilkan 0%.
12. Implementasikan tool calling dengan registry kecil dan policy approval. Mulai dari web_search dan fetch_url. Jangan langsung mengadopsi arsitektur everything-is-a-plugin.
13. Jangan menjadikan local unrestricted shell sebagai fitur MVP. Android app sandbox bukan sandbox aman di dalam aplikasi itu sendiri.
14. Untuk command execution, siapkan interface executor dengan dua implementasi lanjutan:
    - Termux bridge untuk power user, opt-in;
    - remote ephemeral sandbox untuk isolasi yang lebih kuat.

### 1.1 Posisi AmanAI dan custom endpoint

Produk yang dibangun bukan aplikasi khusus AmanAI. Posisi yang harus dijaga sejak MVP:

- first launch meminta pengguna mengisi base URL dan API key sendiri;
- aplikasi melakukan GET /models pada base URL tersebut untuk menemukan model yang tersedia bagi credential itu;
- endpoint boleh berupa AmanAI, OpenAI, gateway pribadi, server self-hosted, atau provider lain selama compatibility profile-nya cukup;
- dokumentasi proyek dan contoh payload memakai AmanAI agar requirement dapat diuji terhadap satu kontrak konkret;
- parsing field enriched AmanAI adalah extension pada normalizer, bukan logika yang tersebar di UI;
- response model list standar yang hanya memiliki id, created, object, dan owned_by tetap harus bekerja melalui fallback JSON dan state unknown;
- tidak ada flow inti yang memeriksa hostname amanai.dev untuk menentukan behavior;
- setiap cache, model override, conversation, dan capability result selalu memiliki endpointId agar data dua endpoint tidak tercampur.

Rekomendasi fase:

| Fase | Isi |
|---|---|
| MVP | First-run endpoint onboarding, Keystore, automatic model discovery, live model refresh, JSON override, Responses streaming, chat history, reasoning picker, max output handling, context meter, auto-compact, stats footer |
| P1 | Chat Completions fallback, image/file input, web search tool, full tool loop, export/import, foreground generation |
| P2 | Termux bridge, remote sandbox, file workspace, MCP, advanced cost and usage dashboard |

## 2. Asumsi, batasan, dan non-goals

### 2.1 Asumsi

- Custom endpoint berarti endpoint yang sebagian atau seluruhnya kompatibel dengan OpenAI API.
- AmanAI dengan base URL https://api.amanai.dev/v1 adalah reference profile dan target verifikasi pertama, bukan endpoint wajib aplikasi.
- Aplikasi adalah BYOK, yaitu API key dimasukkan oleh pengguna dan disimpan hanya di perangkat.
- Aplikasi Android adalah prioritas. Tidak perlu memaksakan abstraksi iOS sebelum ada kebutuhan.
- Model list dapat berubah kapan saja. Model ID dan kemampuan tidak boleh di-hardcode sebagai source of truth.
- Tool calling harus dapat bekerja melalui function tools milik aplikasi, tidak hanya hosted tools milik satu provider.
- Command execution bersifat opsional dan harus dipisahkan dari inti chat.

### 2.2 Non-goals MVP

- Menyalin seluruh fitur Hermes atau DeepSeek Harness.
- Menjalankan Docker langsung di Android.
- Menyediakan shell Linux penuh yang aman tanpa Termux atau backend remote.
- Menyimpan shared service API key di APK.
- Menjamin semua endpoint yang menyebut dirinya OpenAI-compatible memiliki perilaku identik.
- Menebak capability model yang tidak dikirim provider.
- Mengimplementasikan marketplace plugin, subagent, cron, memory, dan MCP sekaligus.

## 3. Hasil riset repo pembanding

### 3.1 Hermes Agent

Hal yang relevan:

- Mendukung custom provider dan banyak model.
- Memiliki agent loop, streaming tool progress, web search, memory, session history, dan beberapa terminal backend.
- Terminal backend mencakup local, Docker, SSH, Singularity, Modal, Daytona, dan Vercel Sandbox.
- Memiliki defense-in-depth: approval, deny rules, hardline blocklist, write safety, credential filtering, dan container isolation.
- Ada jalur Android melalui Termux, tetapi secara resmi dikategorikan Tier 2.
- Jalur Termux tidak mendukung Docker isolation, beberapa dependency desktop, dan background process dapat dihentikan Android.

Pelajaran untuk aplikasi ini:

- Pisahkan chat client dari command executor.
- Jangan menyebut local process sebagai sandbox tanpa boundary yang benar.
- Tool yang bisa melakukan side effect memerlukan approval dan audit trail.
- Remote executor adalah pilihan yang lebih kuat daripada memberi model akses ke proses aplikasi.
- Tidak perlu membawa seluruh learning loop, skill system, gateway, dan scheduler ke MVP.

### 3.2 DeepSeek Harness

Hal yang relevan:

- Arsitektur internal sangat modular dan event-driven.
- Custom provider dapat memakai OpenAI Chat Completions, OpenAI Responses, atau Anthropic Messages.
- Model metadata mencakup context window, max output, reasoning levels, modality, dan compatibility switches.
- Web UI menampilkan turn count, step count, TTFT, generation time, TPS, total token, cache read, cache write, uncached input, output, dan reasoning tokens.
- TPS dihitung dari provider-reported output tokens dibagi waktu decode sejak first token sampai completion.
- Cache hit dihitung dari cache-read tokens dibanding seluruh prompt-side billing buckets.
- Sandbox mode dipisahkan menjadi read-only, workspace-write, dan danger-full-access.
- Jika sandbox yang diminta tidak tersedia, desainnya fail closed, bukan diam-diam menjalankan proses tanpa confinement.

Pelajaran untuk aplikasi ini:

- Normalisasikan usage dari berbagai provider ke satu struktur internal.
- Bedakan TTFT dan TPS.
- Laporkan exact, estimated, unavailable secara eksplisit.
- Model reasoning level harus opaque dan berasal dari provider, bukan enum yang dianggap universal.
- Gunakan permission preset sederhana jika command executor ditambahkan.
- Jangan port plugin framework DeepSeek Harness ke mobile sebelum benar-benar dibutuhkan.

### 3.3 OpenCodeX

Hal yang relevan:

- Menjembatani Responses API ke Chat Completions API.
- Mendukung custom provider, model discovery, manual model entry, exact mapping, context window editing, dan JSON model catalog.
- Mengalirkan SSE secara real-time dan menerjemahkan tool calls serta reasoning content.
- Menunjukkan bahwa compatibility adapter dapat berdiri sebagai lapisan kecil, tanpa runtime agent yang besar.
- Menekankan bahwa model ID harus exact.

Pelajaran untuk aplikasi ini:

- Transport adapter Responses dan Chat Completions masuk akal.
- Mapping friendly name tidak boleh mengubah model ID yang dikirim.
- Katalog JSON dan override manual adalah kebutuhan nyata.
- Fallback protocol harus eksplisit dan dapat didiagnosis.

### 3.4 Kesimpulan perbandingan

| Area | Hermes | DeepSeek Harness | OpenCodeX | Pilihan aplikasi |
|---|---|---|---|---|
| Custom endpoint | Ya | Ya | Ya | Ya |
| Dynamic model list | Ya | Ya | Ya | Ya, refresh saat cold start |
| Model JSON | Config/catalog | Catalog/config | Ya | Ya, tiga lapis |
| Responses API | Ya | Ya | Bridge | Primary |
| Chat Completions | Ya | Ya | Upstream | Fallback |
| Tool loop | Lengkap | Lengkap | Pass-through | Registry kecil |
| TPS/cache UI | Token tracking | Sangat lengkap | Bukan fokus | Ikuti formula DSH |
| Local commands | Banyak backend | Desktop sandbox | Tidak | Bukan MVP |
| Android | Termux Tier 2 | Tidak menjadi target utama | Mobile via proxy | Native Android client |

## 4. Kontrak AmanAI yang sudah terverifikasi

### 4.1 Endpoint

| Method | Path | Kegunaan |
|---|---|---|
| POST | /v1/responses | Responses API, streaming dan non-streaming |
| POST | /v1/chat/completions | Chat Completions, streaming dan non-streaming |
| POST | /v1/messages | Anthropic Messages, out of scope untuk MVP |
| GET | /v1/models | Katalog model live |
| GET | /v1/usage | Saldo dan aktivitas terbaru |
| POST | /v1/embeddings | Embedding, out of scope untuk MVP |

Authentication menerima Authorization: Bearer atau x-api-key.

### 4.2 Metadata model

Live GET /v1/models saat riset menghasilkan field:

~~~json
{
  "id": "amanai/glm-5.3",
  "object": "model",
  "owned_by": "amanai",
  "thinking": ["auto", "low", "medium", "high", "xhigh", "max"],
  "context_length": 1000000,
  "max_output": 128000,
  "vendor": "zai",
  "input_modalities": ["text"],
  "description": "Model description",
  "pricing_version": "v3",
  "pricing": {
    "currency": "amanai_credit",
    "unit": "token",
    "billing": "per_token_floor",
    "prompt": "5.6",
    "completion": "28",
    "input_cache_read": "1.4",
    "minimum_request": "1000"
  }
}
~~~

Nilai thinking yang ditemukan secara live:

- auto
- none
- minimal
- low
- medium
- high
- xhigh
- max

Nilai input modality yang ditemukan:

- text
- image
- file
- video

### 4.3 Reasoning

Dokumentasi AmanAI menyatakan:

- Responses API memakai reasoning.effort.
- Messages API memakai thinking string.
- thinking array pada katalog adalah daftar yang valid per model.
- Model dengan hanya auto tidak perlu menampilkan runtime selector.

Aturan aplikasi:

- Jangan hardcode hanya low, medium, high.
- Pertahankan urutan yang diberikan provider.
- auto berarti provider decides. Default OpenAI-compatible yang paling aman adalah tidak mengirim field effort.
- Jika endpoint membutuhkan literal auto, behavior dapat dioverride pada model atau endpoint.
- none harus dikirim hanya jika diiklankan atau dioverride.

### 4.4 Max token

Ada dua limit berbeda:

- max_output adalah kemampuan model dari katalog.
- Dokumentasi Chat Completions AmanAI menyatakan max_tokens diklem ke ceiling 8192.

Karena itu aplikasi harus menghitung:

~~~text
effectiveMaxOutput = minimum(
  model.maxOutputTokens jika diketahui,
  protocol.endpointOutputCap jika diketahui
)
~~~

Untuk AmanAI:

- Responses API: gunakan max_output model sebagai UI ceiling, tetapi tetap tangani error provider.
- Chat Completions: effective ceiling maksimal 8192 berdasarkan dokumentasi saat ini.

Jangan menyamakan context window dengan max output.

### 4.5 Tool calling dan streaming

Dokumentasi AmanAI menyatakan Responses API meneruskan tool calls, reasoning, structured output, dan streaming. Katalog saat ini tidak memiliki field universal supports_tools per model.

Konsekuensi:

- Tool capability awal dapat bernilai supported, unsupported, atau unknown.
- Jangan menganggap semua model pasti mendukung tool hanya karena endpoint mendukungnya.
- Simpan hasil runtime failure sebagai diagnostic, bukan langsung mengubah metadata permanen.
- User override dapat menetapkan support jika pengguna sudah tahu.

### 4.6 Error yang perlu dipetakan

| HTTP | AmanAI code | UX |
|---|---|---|
| 401 | invalid_api_key, invalid_auth | Minta perbaiki key |
| 402 | insufficient_credits | Tampilkan saldo habis dan link/settings |
| 403 | key_revoked, key_expired | Minta ganti key |
| 403 | model_forbidden | Tandai model tidak tersedia untuk credential aktif |
| 404 | model_not_found | Refresh katalog, pertahankan history |
| 429 | rate_limit | Retry setelah delay jika belum ada output |
| 429 | concurrency_limit | Tawarkan tunggu atau stop request lain |
| 502 | upstream_error | Retry terbatas jika belum ada output |
| 503 | overloaded_error | Retry terbatas dengan backoff |

Setelah stream mengirim output, jangan auto-retry karena dapat menggandakan biaya, tool call, atau jawaban.

### 4.7 Status compaction AmanAI

Dokumentasi AmanAI yang diperiksa menyebut POST /v1/responses, tetapi tidak mencantumkan POST /v1/responses/compact atau parameter context_management. Ini tidak membuktikan fitur tersebut pasti tidak ada, tetapi berarti aplikasi tidak boleh mengasumsikannya tersedia.

Untuk preset AmanAI:

- nativeCompaction default unknown;
- local compaction menjadi behavior awal;
- pengguna dapat mengaktifkan native compaction melalui override setelah endpoint tersebut benar-benar diuji;
- capability hasil runtime disimpan per endpoint dan model, bukan digeneralisasi ke semua endpoint OpenAI-compatible.

## 5. Requirement produk

### 5.1 Must-have MVP

| ID | Requirement | Acceptance ringkas |
|---|---|---|
| FR-001 | Custom endpoint onboarding | First launch meminta base URL, auth mode, dan API key lalu menjalankan Connect & discover |
| FR-002 | Secure credential | API key tidak muncul di JSON, log, crash report, atau backup biasa |
| FR-003 | Automatic model discovery | Connect memanggil GET /models dari endpoint pengguna; cold start berikutnya memuat cache lalu refresh di background |
| FR-004 | Model metadata | Picker mengetahui context, max output, thinking, modality jika tersedia |
| FR-005 | JSON override | Pengguna dapat edit, import, export, reset metadata model |
| FR-006 | Missing-field fallback | Field kosong tidak membuat crash dan memiliki behavior eksplisit |
| FR-007 | Responses streaming | Text, reasoning summary, tool item, usage, completion, dan error dapat diparse |
| FR-008 | Conversation | New chat, history, rename, delete, stop, retry, copy, markdown |
| FR-009 | Reasoning picker | Hanya menampilkan effort yang valid untuk model |
| FR-010 | Output limit | Request field dan ceiling mengikuti protocol/model |
| FR-011 | Stats footer | TPS, TTFT, token, dan cache hit tampil jika data tersedia |
| FR-012 | Recovery | Partial response tersimpan dan request interrupted dapat dikenali |
| FR-013 | Diagnostics | Error menampilkan endpoint, protocol, status, provider code, request ID tanpa secret |
| FR-014 | Context meter | UI menampilkan persen terpakai dan persen tersisa dengan label exact, estimated, atau unknown |
| FR-015 | Auto-compact | Sebelum context penuh, history lama dikompaksi tanpa menghapus transkrip asli dan tanpa memutus tool transaction |

### 5.2 Should-have P1

| ID | Requirement |
|---|---|
| FR-101 | Chat Completions fallback |
| FR-102 | Function tool loop |
| FR-103 | App-owned web_search tool |
| FR-104 | Safe fetch_url tool |
| FR-105 | Per-tool approval policy |
| FR-106 | Image and file attachment sesuai modality |
| FR-107 | Foreground service untuk generation saat app di-background-kan |
| FR-108 | Usage screen untuk /v1/usage |
| FR-109 | Export/import percakapan dan config tanpa credential |
| FR-110 | Multi-endpoint profiles dan endpoint switcher |

### 5.3 Later P2

| ID | Requirement |
|---|---|
| FR-201 | Termux command executor |
| FR-202 | Remote sandbox executor |
| FR-203 | Workspace file browser |
| FR-204 | MCP client |
| FR-205 | Cost estimation berdasarkan pricing metadata |
| FR-206 | Branching conversation dan inspeksi riwayat compaction |
| FR-207 | Voice and realtime |

## 6. Arsitektur yang direkomendasikan

~~~mermaid
flowchart TD
    UI[React Native UI] --> APP[Application services]
    APP --> CHAT[Conversation repository]
    APP --> CATALOG[Model catalog service]
    APP --> AGENT[Agent and tool loop]
    APP --> TRANSPORT[LLM transport]
    APP --> CONTEXT[Context budget and compaction]

    CATALOG --> LIVE[Live catalog JSON]
    CATALOG --> OVERRIDE[model-overrides.json]
    CATALOG --> DEFAULTS[Bundled model-defaults.json]

    TRANSPORT --> RESP[Responses adapter]
    TRANSPORT --> CHATAPI[Chat Completions adapter]
    RESP --> HTTP[Kotlin OkHttp streaming module]
    CHATAPI --> HTTP
    HTTP --> ENDPOINT[Custom OAI endpoint]

    AGENT --> TOOLS[Tool registry]
    TOOLS --> SEARCH[Web search]
    TOOLS --> FETCH[Safe URL fetch]
    TOOLS --> EXEC[Command executor interface]
    EXEC --> TERMUX[Optional Termux]
    EXEC --> REMOTE[Optional remote sandbox]

    CHAT --> SQLITE[(SQLite)]
    CONTEXT --> CHAT
    CONTEXT --> TRANSPORT
    HTTP --> METRICS[Usage and timing normalizer]
    METRICS --> UI
~~~

### 6.1 Modul inti

| Modul | Tanggung jawab |
|---|---|
| EndpointProfileService | Base URL, protocol mode, auth mode, custom headers aman |
| CredentialStore | Android Keystore, create/read/delete credential by ID |
| ModelCatalogService | Fetch, validate, snapshot, merge, fallback, import/export |
| ResponsesTransport | Request dan event mapping untuk /responses |
| ChatCompletionsTransport | Request dan chunk mapping untuk /chat/completions |
| StreamClient | OkHttp, cancellation, timeout, timestamp, SSE bytes |
| ConversationRepository | SQLite transaction dan pagination |
| AgentLoop | Request -> tool calls -> approval -> tool result -> next request |
| ToolRegistry | Tool schema, executor, policy, timeout, output limits |
| UsageNormalizer | Field provider -> struktur usage internal |
| MetricsCalculator | TTFT, decode time, TPS, cache hit, session totals |
| ContextManager | Estimate occupancy, reserve output, trigger compaction, build effective model context |
| CommandExecutor | Interface disabled, Termux, remote |

### 6.2 Prinsip arsitektur

- Provider-specific parsing berada di adapter, bukan di UI.
- UI hanya membaca model metadata ter-normalisasi.
- Raw provider payload dapat disimpan terbatas untuk debugging, tetapi harus direduksi dan disanitasi.
- Request yang sedang berjalan mengambil immutable snapshot endpoint dan model config. Edit settings tidak boleh mengubah request di tengah stream.
- Tool policy ditegakkan oleh aplikasi, bukan oleh system prompt.
- Capability unknown tetap unknown sampai ada metadata atau override.

## 7. Endpoint profile dan compatibility layer

### 7.1 Struktur endpoint profile

Contoh berikut memakai AmanAI sebagai reference profile. Struktur yang sama dibuat dari input pengguna untuk endpoint lain. AmanAI profile tidak perlu ditanam sebagai satu-satunya pilihan.

~~~json
{
  "schemaVersion": 1,
  "id": "amanai-main",
  "name": "AmanAI",
  "baseUrl": "https://api.amanai.dev/v1",
  "protocol": "responses",
  "auth": {
    "mode": "bearer",
    "credentialRef": "credential-uuid"
  },
  "headers": {
    "User-Agent": "MyLLM-Android/1"
  },
  "compat": {
    "modelListPath": "/models",
    "responsesPath": "/responses",
    "responsesCompactPath": null,
    "chatCompletionsPath": "/chat/completions",
    "chatMaxTokensField": "max_tokens",
    "responsesMaxTokensField": "max_output_tokens",
    "autoReasoningBehavior": "omit",
    "nativeContextManagement": "unknown",
    "chatOutputCap": 8192
  }
}
~~~

Catatan:

- Secret tidak boleh berada di profile.
- Header Authorization dan x-api-key dibuat saat request.
- Custom header tidak boleh mengizinkan pengguna menimpa Host atau Content-Length.
- Authorization harus dihapus jika redirect berpindah host.
- Path atau capability compaction yang null/unknown berarti aplikasi memakai compaction lokal, bukan menebak dukungan provider.

### 7.2 First-run onboarding dan model discovery

Saat belum ada endpoint profile, aplikasi membuka setup screen, bukan chat kosong. Field minimum:

| Field | Default | Catatan |
|---|---|---|
| Endpoint name | Dihasilkan dari hostname | Dapat diedit, bukan identifier keamanan |
| Base URL | Kosong | Contoh helper: https://api.example.com/v1 |
| API key | Kosong | Wajib untuk Connect, disimpan di Keystore |
| Auth mode | Bearer | Pilihan awal Bearer atau x-api-key |
| Protocol | Auto | Responses lebih dulu, Chat Completions fallback sesuai aturan |
| Models path | /models | Advanced field, tidak perlu terlihat pada mode normal |

Tombol utama adalah `Connect & discover models`. Alurnya:

1. Validasi dan normalisasi base URL.
2. Tampilkan URL final model discovery agar kesalahan /v1/v1 terlihat sebelum request.
3. Buat credentialRef dan simpan API key di Android Keystore, bukan di endpoint JSON.
4. Kirim authenticated GET ke baseUrl + modelListPath.
5. Terima bentuk standar OpenAI `{ "object": "list", "data": [...] }`.
6. Normalisasi field standar dan extension yang dikenali.
7. Validasi bahwa setidaknya ada satu model dengan id valid.
8. Tulis last-known-good catalog cache secara atomik.
9. Tampilkan model picker dan minta pengguna memilih default model.
10. Buka chat hanya setelah endpoint profile dan model aktif valid.

Untuk model list standar, aplikasi biasanya hanya memperoleh id, created, object, dan owned_by. Context window, max output, reasoning levels, modalities, tools, dan pricing tetap unknown kecuali tersedia dari:

1. extension field pada response provider;
2. user override;
3. bundled model default yang cocok persis dengan model ID.

Urutan tersebut mencegah aplikasi mengklaim metadata yang tidak diberikan provider. AmanAI lebih kaya daripada kontrak OpenAI Models API standar, sehingga auto-discovery AmanAI dapat langsung mengisi lebih banyak detail. Endpoint lain tetap dapat dipakai meskipun hanya mengembalikan ID model.

Failure behavior:

- 401/403: tetap di setup screen, tandai masalah credential, jangan log key;
- 404: tampilkan URL final dan sarankan pengguna memeriksa apakah base URL perlu menyertakan /v1;
- network/TLS failure: tampilkan penyebab tanpa menyimpan katalog kosong;
- response valid tetapi data kosong: jangan membuat model palsu;
- schema tidak kompatibel: sediakan diagnostic ringkas dan opsi advanced untuk mengubah models path atau menambah model manual;
- retry menggunakan form yang sama dan tidak membuat endpoint profile duplikat.

Discovery GET /models tidak membuktikan bahwa Responses, Chat Completions, streaming, tools, atau reasoning didukung. Capability tersebut berasal dari metadata, override, atau hasil request nyata sesuai compatibility rules.

### 7.3 Base URL normalization

Aplikasi harus menerima input:

- https://api.example.com
- https://api.example.com/
- https://api.example.com/v1
- https://api.example.com/v1/

Aturan:

1. Trim whitespace.
2. Wajib absolute URL.
3. Hapus trailing slash.
4. Jangan menambah /v1 jika pengguna sudah memberikannya.
5. Dokumentasi dan smoke test AmanAI memakai https://api.amanai.dev/v1.
6. Path endpoint ditambahkan secara konsisten tanpa menghasilkan /v1/v1.
7. Simpan URL yang sudah dinormalisasi dan tampilkan preview URL final.
8. Jika /models menghasilkan 404, sarankan kemungkinan /v1 tetapi jangan mengubah URL diam-diam.

### 7.4 Protocol selection

Pilihan:

- responses
- chat-completions
- auto

Behavior auto:

1. Jangan melakukan request billable hanya untuk probing.
2. Coba Responses pada request chat pertama.
3. Fallback ke Chat Completions hanya untuk 404, 405, atau 501 sebelum ada body output.
4. Jangan fallback untuk 400 generik karena penyebabnya dapat berupa prompt, model, tool schema, atau parameter yang salah.
5. Simpan protocol yang berhasil untuk endpoint tersebut, tetapi izinkan reset.

Profile AmanAI yang dibuat melalui setup boleh merekomendasikan responses agar tidak perlu probe. Custom endpoint lain default ke auto.

### 7.5 Mengapa direct HTTP, bukan SDK penuh

Direct HTTP direkomendasikan karena:

- custom endpoint sering memiliki extension field;
- aplikasi memerlukan timestamp chunk yang presisi;
- parser harus mendukung Responses dan Chat Completions;
- compatibility error perlu terlihat jelas;
- SDK dapat membawa asumsi Node atau provider tertentu;
- dependency lebih sedikit.

## 8. Desain katalog model JSON

### 8.1 Tiga lapis file

| File | Pemilik | Dapat ditimpa refresh | Dapat diedit user |
|---|---|---|---|
| model-defaults.json | App bundle | Tidak | Tidak langsung |
| catalog-cache/endpoint-id.json | ModelCatalogService | Ya, atomik | Melalui override |
| model-overrides.json | Pengguna | Tidak | Ya |

Percakapan tidak disimpan di file-file ini.

### 8.2 Mengapa bukan satu models.json

Satu file menimbulkan konflik:

- refresh dapat menghapus edit pengguna;
- edit pengguna dapat menyamarkan data live terbaru;
- sulit membedakan metadata provider dan tebakan lokal;
- korupsi satu file dapat menghilangkan semuanya;
- tidak ada cara bersih untuk reset satu field.

Dengan tiga lapis:

- snapshot live dapat dibuang dan dibuat ulang;
- override tetap stabil;
- default bawaan dapat bermigrasi bersama versi aplikasi;
- provenance field dapat ditampilkan.

### 8.3 Snapshot katalog live

~~~json
{
  "schemaVersion": 1,
  "endpointId": "amanai-main",
  "baseUrlFingerprint": "sha256-value",
  "fetchedAt": "2026-09-16T10:00:00Z",
  "checkedAt": "2026-09-16T10:00:00Z",
  "etag": null,
  "contentHash": "sha256-value",
  "models": [
    {
      "id": "amanai/glm-5.3",
      "displayName": "amanai/glm-5.3",
      "vendor": "zai",
      "ownedBy": "amanai",
      "description": "Model description",
      "contextWindow": 1000000,
      "maxOutputTokens": 128000,
      "reasoningEfforts": ["auto", "low", "medium", "high", "xhigh", "max"],
      "inputModalities": ["text"],
      "capabilities": {
        "streaming": "supported",
        "tools": "unknown",
        "structuredOutput": "unknown",
        "nativeCompaction": "unknown"
      },
      "pricing": {
        "version": "v3",
        "currency": "amanai_credit",
        "input": "5.6",
        "output": "28",
        "cacheRead": "1.4",
        "minimumRequest": "1000"
      },
      "raw": {
        "object": "model"
      }
    }
  ]
}
~~~

Raw hanya menyimpan field yang belum dinormalisasi dan dibutuhkan untuk forward compatibility. Jangan menduplikasi API key, auth header, atau response header sensitif.

### 8.4 User override

~~~json
{
  "schemaVersion": 1,
  "endpoints": {
    "amanai-main": {
      "models": {
        "amanai/glm-5.3": {
          "displayName": "GLM 5.3",
          "enabled": true,
          "contextWindow": 1000000,
          "maxOutputTokens": 64000,
          "reasoningEfforts": ["auto", "low", "medium", "high"],
          "capabilities": {
            "tools": "supported",
            "nativeCompaction": "unsupported"
          },
          "request": {
            "autoReasoningBehavior": "omit"
          },
          "contextPolicy": {
            "autoCompact": true,
            "triggerPercent": 80,
            "targetPercent": 55,
            "hardStopPercent": 95,
            "minimumRecentTurns": 4
          }
        }
      }
    }
  }
}
~~~

Semantik:

- Field yang tidak ada berarti inherit.
- null berarti hapus override dan kembali inherit, bukan menetapkan value kosong.
- enabled false menyembunyikan model dari picker, tetapi history tetap dapat merender model tersebut.
- Array override mengganti array upstream, bukan menggabungkan.
- Model custom boleh ditambahkan walau tidak ada di live catalog.

### 8.5 Merge algorithm

Untuk setiap model ID:

1. Ambil bundled default jika ada.
2. Overlay snapshot live.
3. Overlay user override.
4. Validasi hasil.
5. Hitung derived fields, termasuk effective max output.
6. Simpan provenance per field di memory untuk layar detail.

Contoh provenance:

~~~json
{
  "contextWindow": {
    "value": 1000000,
    "source": "live"
  },
  "maxOutputTokens": {
    "value": 64000,
    "source": "user-override"
  },
  "capabilities.tools": {
    "value": "supported",
    "source": "user-override"
  }
}
~~~

### 8.6 Fallback field

| Field | Fallback | Behavior UI |
|---|---|---|
| id | Tidak ada | Record invalid, skip dan catat diagnostic |
| displayName | id | Tampilkan exact ID |
| vendor | owned_by, lalu prefix sebelum slash, lalu unknown | Badge opsional |
| description | Empty | Sembunyikan description |
| contextWindow | default bawaan, lalu null | Tampilkan Unknown, jangan hitung persentase |
| maxOutputTokens | default bawaan, lalu endpoint cap, lalu null | Auto mode, omit field jika tidak diketahui |
| reasoningEfforts | default bawaan, lalu empty array | Sembunyikan picker |
| inputModalities | default bawaan, lalu text dengan status inferred | Attachment non-text tetap disabled |
| tools | default bawaan, lalu unknown | Tool toggle memberi warning atau membutuhkan override |
| streaming | endpoint profile, default supported | Tangani failure, jangan klaim terverifikasi |
| nativeCompaction | endpoint/model override, lalu unknown | Jangan kirim field atau memanggil endpoint native secara otomatis |
| contextPolicy | global app setting, lalu optional model override | Auto-compact tetap bekerja secara lokal jika contextWindow diketahui |
| pricing | null | Sembunyikan cost |

Penting:

- Unknown bukan false.
- Tidak adanya cached_tokens bukan cache hit 0%.
- Tidak adanya reasoningEfforts bukan bukti model tidak bisa reasoning.
- Jangan mengarang context window besar berdasarkan nama model.
- Policy context harus divalidasi: targetPercent < triggerPercent < hardStopPercent dan semuanya dalam rentang aman.

### 8.7 Refresh lifecycle

Pada cold start:

1. Jika belum ada endpoint profile, buka first-run onboarding dan jangan menghubungi AmanAI atau endpoint default apa pun.
2. Load bundled defaults.
3. Load dan validasi user overrides untuk endpoint aktif.
4. Load last-known-good catalog cache endpoint aktif.
5. Render model picker dari merged cached state.
6. Mulai GET /models endpoint aktif di background.
7. Jika response valid dan tidak kosong, tulis temp file di directory yang sama.
8. fsync jika tersedia, lalu atomic rename.
9. Simpan backup satu generasi.
10. Recompute merged catalog.
11. Jangan mengganti model aktif di conversation yang sedang streaming.

Catalog cache harus dipisahkan per endpointId. Pergantian credential memaksa refresh karena dua API key pada base URL yang sama dapat memiliki izin model berbeda.

Trigger refresh:

- cold start;
- perubahan endpoint;
- perubahan credential;
- pull-to-refresh/manual refresh;
- resume setelah TTL, misalnya 6 jam;
- model_not_found.

Failure:

- Network failure: gunakan stale cache dan tampilkan last refreshed.
- 401/403: pertahankan cache, tandai credential problem.
- Empty list tidak terduga: jangan hapus last-known-good secara otomatis.
- Invalid JSON/schema: simpan diagnostic dan pertahankan cache.
- Model hilang dari katalog: tandai unavailable, jangan hapus metadata history.

### 8.8 Editor dan import/export

Mode normal:

- Form per model.
- Reset satu field.
- Reset satu model.
- Enable/disable model.
- Tambah custom model.

Mode advanced:

- Raw JSON editor.
- JSON schema validation sebelum save.
- Preview diff.
- Backup sebelum overwrite.
- Import dari file melalui Android Storage Access Framework.
- Export tanpa credential.
- Tombol restore backup.

## 9. Request configuration

### 9.1 Responses request

~~~json
{
  "model": "amanai/gpt-5.6-terra",
  "input": [
    {
      "role": "system",
      "content": "You are the assistant inside MyLLM."
    },
    {
      "role": "user",
      "content": "Hello"
    }
  ],
  "stream": true,
  "max_output_tokens": 4096,
  "reasoning": {
    "effort": "medium"
  },
  "tools": []
}
~~~

Aturan:

- Omit reasoning jika auto dan behavior adalah omit.
- Omit max_output_tokens jika user memilih Auto dan metadata tidak memberi safe ceiling.
- Keep the stable system prompt as the first input message and preserve the complete model-visible history as an append-only sequence. This makes exact-prefix cache behavior inspectable across compatible gateways.
- Batasi parallel tool calls sesuai executor.
- store false dapat menjadi privacy setting, tetapi stateless replay harus lengkap.
- Jangan mengirim context_management atau memanggil /responses/compact kecuali endpoint/model capability dinyatakan supported.

### 9.2 State strategy

Ada dua pilihan:

| Strategi | Kelebihan | Kekurangan |
|---|---|---|
| previous_response_id | Payload kecil, state provider terjaga | Bergantung remote retention dan endpoint support |
| Stateless replay | History lokal authoritative, mudah pindah endpoint | Payload besar, reasoning replay lebih rumit |

Rekomendasi:

- AmanAI reference docs saat ini mendokumentasikan `input` array, bukan `previous_response_id`; gunakan stateless replay untuk AmanAI. Pakai `previous_response_id` hanya jika capability endpoint terdokumentasi dan tervalidasi.
- Simpan canonical local event log tetap wajib.
- Jika provider tidak mendukung chaining, gunakan stateless replay.
- Jangan memakai response ID lama setelah endpoint atau model diganti tanpa validasi.
- Saat replay Responses items, pertahankan item type, call ID, dan phase bila ada.
- Setelah compaction lokal, mulai stateless replay dari compacted context dan putus rantai previous_response_id lama secara sengaja.
- Setelah compaction native, lanjutkan memakai output compaction persis seperti kontrak provider dan jangan mencoba membaca opaque encrypted content.

### 9.3 Chat Completions fallback

Mapping minimal:

- instructions -> system message;
- input message -> messages;
- function tool schema -> tools;
- tool result -> role tool dengan tool_call_id;
- max output -> endpoint-specific max_tokens atau max_completion_tokens;
- reasoning -> reasoning_effort jika profile menyatakan;
- stream -> true.

Perbedaan provider disimpan dalam endpoint/model compat config, bukan if berdasarkan string nama model di UI.

### 9.4 Streaming parser

Parser harus menangani:

- CRLF dan LF;
- comment/heartbeat lines;
- multi-line data;
- event field terpisah;
- data: [DONE];
- unknown event types;
- JSON delta yang terfragmentasi pada level network;
- tool argument JSON yang terfragmentasi pada beberapa event;
- abrupt EOF;
- HTTP error body non-SSE;
- cancellation.

Event internal yang disarankan:

~~~text
request.started
response.created
reasoning.delta
text.delta
tool_call.started
tool_call.arguments.delta
tool_call.completed
usage.updated
response.completed
response.failed
request.cancelled
~~~

UI update harus dibatch sekitar 30 sampai 60 ms agar tidak re-render untuk setiap byte/token.

## 10. Conversation dan persistence

### 10.1 Mengapa SQLite

Conversation memiliki:

- banyak message dan content parts;
- tool calls dan tool results;
- partial stream;
- retry dan alternate response;
- usage per step;
- pagination;
- pencarian;
- transaction recovery.

JSON tunggal akan lambat dan rawan korupsi ketika history membesar. Model metadata tetap JSON, tetapi conversation sebaiknya SQLite.

### 10.2 Entitas minimum

| Entitas | Field penting |
|---|---|
| conversations | id, title, createdAt, updatedAt, endpointId, activeModelId |
| turns | id, conversationId, ordinal, status, startedAt, completedAt |
| items | id, turnId, type, role, contentJson, providerItemId, phase |
| tool_calls | id, turnId, callId, name, argumentsJson, status, approval |
| usage | turnId, input, cacheRead, cacheWrite, output, reasoning, total |
| timing | turnId, requestStart, firstEvent, firstVisibleToken, completed |
| compactions | id, conversationId, method, sourceStartTurnId, sourceEndTurnId, summaryJson atau opaqueItemsJson, inputTokens, outputTokens, createdAt, status |

### 10.3 State machine turn

~~~text
draft
  -> compacting
  -> sending
  -> streaming
  -> awaiting_tool
  -> executing_tool
  -> sending_tool_result
  -> streaming
  -> completed

Terminal states:
  failed
  cancelled
  interrupted
~~~

Persist status dan partial content setiap batch, bukan hanya saat selesai.

### 10.4 Chat UX minimum

- New chat.
- Conversation list.
- Auto title setelah first response, dengan fallback potongan prompt.
- Rename dan delete dengan confirmation.
- Stop generation.
- Retry last turn.
- Edit dan resend user message dapat masuk P1.
- Copy message.
- Select text.
- Markdown, table, link, list, dan fenced code.
- Syntax highlighting harus lazy dan dibatasi agar long code tidak membuat UI hang.
- Tool call tampil sebagai expandable card.
- Reasoning summary dapat disembunyikan/collapse sesuai data provider.
- Model dan reasoning level terlihat pada header/composer.
- Context pill menampilkan nilai seperti `62% used, 38% left` dan dapat diketuk untuk melihat perhitungan.
- Event auto-compact tampil sebagai separator ringan, tetapi transkrip lama tetap dapat dibaca dan dicari.

## 11. Metrics dan token accounting

### 11.1 Struktur usage internal

~~~json
{
  "uncachedInputTokens": 1200,
  "cacheReadTokens": 8000,
  "cacheWriteTokens": 0,
  "outputTokens": 420,
  "reasoningTokens": 200,
  "totalTokens": 9620,
  "quality": "exact",
  "source": "provider"
}
~~~

Nilai dapat null jika provider tidak mengirimkannya.

### 11.2 Normalisasi provider

Responses API:

- input_tokens adalah aggregate input.
- input_tokens_details.cached_tokens adalah subset cached input.
- input_tokens_details.cache_write_tokens dapat tersedia.
- output_tokens_details.reasoning_tokens adalah subset output.
- uncached input = input_tokens - cached_tokens jika semantics provider sesuai OpenAI.

Chat Completions:

- prompt_tokens adalah aggregate prompt.
- prompt_tokens_details.cached_tokens adalah subset cache jika ada.
- DeepSeek-style prompt_cache_hit_tokens juga perlu dikenali.
- completion_tokens_details.reasoning_tokens perlu dikenali.

Jangan menjumlahkan aggregate prompt dengan cached subset dua kali.

Optimasi cache harus menjaga prefix byte-identical: taruh instruksi stabil di awal, append message baru tanpa menulis ulang history lama, dan pertahankan parameter request yang memengaruhi prefix. Pada Responses API, gunakan `prompt_cache_key` stabil untuk request dalam conversation yang sama. DeepSeek juga mensyaratkan prefix dari token pertama tetap sama. Persentase tinggi tidak boleh dikejar dengan padding karena total token dan biaya dapat justru naik.

### 11.3 Formula

TTFT:

~~~text
TTFT = first model output event time - request dispatch time
~~~

First visible token dapat dicatat terpisah dari first reasoning/tool event.

Decode duration:

~~~text
decodeDuration = response completed time - first output token time
~~~

TPS:

~~~text
TPS = providerReportedOutputTokens / decodeDurationSeconds
~~~

Jika output token exact baru tersedia pada akhir stream:

- selama streaming tampilkan live estimate dengan label approximately;
- setelah complete ganti dengan exact TPS;
- jika token count tidak tersedia, sembunyikan exact TPS atau tampilkan estimate yang jelas.

Cache hit:

~~~text
promptDenominator = uncachedInput + cacheRead + cacheWrite
cacheHitPercent = cacheRead / promptDenominator * 100
~~~

Jika provider hanya memberi aggregate input dan cached subset:

~~~text
cacheHitPercent = cachedTokens / inputTokens * 100
~~~

Jika denominator nol atau cache field absent, tampilkan unavailable, bukan 0%.

### 11.4 Footer yang direkomendasikan

Compact footer di bawah composer:

~~~text
Context budget 62% used | 38% left | 18.4 tok/s | Cache 83%
~~~

Tap membuka detail:

- request wall time;
- TTFT;
- decode time;
- TPS;
- uncached input;
- cache read;
- cache write;
- output;
- reasoning;
- total;
- context used dan remaining;
- token yang dicadangkan untuk output;
- safety margin;
- context source: exact, estimated, atau unknown;
- per-turn dan session cumulative;
- exact/estimated label;
- model dan protocol.

### 11.5 Context meter dan pressure

Context meter harus menghitung payload efektif yang akan dilihat model, bukan jumlah token kumulatif seluruh sesi. Token lama dapat sudah dikompaksi, dipotong, atau tidak dikirim ulang.

Sebelum request, hitung:

~~~text
requestedOutputReserve = userOutputLimit jika explicit,
                         selain itu min(effectiveModelMaxOutput, appAutoOutputBudget),
                         selain itu appAutoOutputBudget
reservedOutput = min(requestedOutputReserve, effectiveModelMaxOutput jika diketahui)
safetyMargin = min(8192, max(1024, floor(contextWindow * 0.02)))
prospectiveUsed = estimatedEffectiveInput + reservedOutput + safetyMargin
usedPercent = clamp(prospectiveUsed / contextWindow * 100, 0, 100)
remainingTokens = max(0, contextWindow - prospectiveUsed)
remainingPercent = clamp(100 - usedPercent, 0, 100)
~~~

appAutoOutputBudget adalah reserve konservatif yang dapat dikonfigurasi, default awal 4096 token. Reserve ini bukan berarti model pasti menghabiskan token sebanyak itu. Tujuannya mencegah input mengambil seluruh context sehingga tidak ada ruang untuk jawaban dan reasoning.

Request assembler harus memakai output ceiling yang sama dengan reservedOutput. Jika protocol memaksa field output limit dihilangkan, meter harus memakai effective model max output sebagai reserve atau menandai hasil uncertain. Jangan menampilkan sisa aman berdasarkan reserve 4096 jika provider sebenarnya bebas menghasilkan 128K token.

Tampilkan kedua nilai agar tidak ambigu:

~~~text
62% used | 38% left | approximately 38K tokens left
~~~

Quality state:

- exact: tokenizer yang tepat untuk model atau provider memberikan context occupancy eksplisit;
- provider-reported: usage final dari response sebelumnya, tetapi payload berikutnya belum dihitung;
- estimated: tokenizer family atau heuristic lokal;
- unknown: contextWindow atau input size tidak tersedia.

Provider usage setelah response adalah sumber terbaik untuk request yang baru selesai, tetapi preflight request berikutnya tetap perlu menghitung user message baru, tool schema, attachment, summary, dan output reserve. Jika tidak ada tokenizer tepat, heuristic lokal harus konservatif dan berlabel estimated. Untuk teks multi-bahasa, jangan memakai satu rasio karakter yang diklaim exact.

Warna pressure yang direkomendasikan:

| Used | State | UI |
|---:|---|---|
| < 70% | normal | Neutral |
| 70% sampai sebelum trigger | watch | Kuning lembut |
| trigger sampai sebelum hard stop | compacting/high | Oranye |
| >= hard stop | critical | Merah dan cegah request yang tidak aman |

Jika contextWindow null, tampilkan jumlah token jika ada dan label `Context limit unknown`. Persentase dan auto-compact otomatis dinonaktifkan sampai metadata tersedia atau pengguna mengisi override.

### 11.6 Auto-compact policy

Auto-compact adalah requirement MVP. Default policy yang direkomendasikan:

~~~json
{
  "autoCompact": true,
  "triggerPercent": 80,
  "targetPercent": 55,
  "hardStopPercent": 95,
  "minimumRecentTurns": 4,
  "reservedOutputTokens": "auto"
}
~~~

Trigger diperiksa:

- setelah response selesai;
- setelah tool result besar masuk;
- saat draft user berubah, dengan debounce;
- tepat sebelum send;
- setelah context_length_exceeded dari server.

Preflight menggunakan prospectiveUsed setelah memasukkan draft baru dan output reserve. Jika nilainya >= triggerPercent, lakukan compaction sebelum mengirim request utama. Target hasil compaction <= targetPercent. Jarak antara target dan trigger memberi hysteresis supaya aplikasi tidak compact setiap turn.

Jangan compact ketika ada tool call yang belum memperoleh result, approval yang belum diputuskan, stream aktif, atau transaksi side effect belum selesai. Selesaikan atau batalkan transaction lebih dulu agar pasangan tool call dan tool result tidak terpisah.

### 11.7 Native compaction versus local compaction

OpenAI Responses API terbaru mendokumentasikan dua mekanisme:

- POST /responses/compact yang menghasilkan compaction item opaque;
- context_management pada create response untuk context management provider-side.

Namun, dokumentasi AmanAI yang diperiksa hanya mendokumentasikan POST /v1/responses dan belum mendokumentasikan /v1/responses/compact atau context_management. Karena OpenAI-compatible tidak berarti seluruh extension tersedia, aplikasi tidak boleh mengirim fitur ini secara default ke AmanAI.

Pemilihan metode:

1. Pakai native compaction hanya jika capability dari katalog, endpoint profile, atau override bernilai supported.
2. Jangan melakukan billable probe tersembunyi.
3. Simpan native compaction output sebagai opaque items dan replay tanpa mengubah isinya.
4. Jika native call gagal dengan 404, 405, atau 501 sebelum menghasilkan output, tandai unsupported untuk endpoint/model tersebut dan gunakan local compaction.
5. Error auth, billing, rate limit, atau malformed request tidak boleh diam-diam dianggap unsupported.
6. Local compaction menjadi fallback portable untuk Responses dan Chat Completions.

### 11.8 Algoritma local compaction

Istilah local compaction di dokumen ini berarti compaction diorkestrasi dan disimpan oleh client, bukan berarti summarization berjalan sepenuhnya on-device. Secara default, summary dibuat melalui model aktif pada endpoint yang sama. Implementasi on-device dapat ditambahkan nanti jika kualitas, ukuran model, dan konsumsi baterai dapat diterima.

Transkrip UI tetap immutable di SQLite. Compaction hanya mengubah effective context yang dikirim ke model.

Alur:

1. Bangun payload preflight beserta estimasi token.
2. Pilih prefix turn lengkap yang cukup tua untuk dikompaksi.
3. Pertahankan instructions aktif, pinned user facts, minimal recent turns, attachment references yang masih diperlukan, dan seluruh active tool transaction.
4. Minta model membuat summary terstruktur dari prefix tersebut dengan output limit kecil.
5. Validasi summary tidak kosong, tidak melewati target, dan menyertakan field wajib.
6. Simpan record compaction beserta rentang source turn, usage, model, prompt version, dan status.
7. Payload berikutnya berisi instructions asli, satu compaction summary, dan recent turns yang dipertahankan.
8. Hitung ulang occupancy. Jika masih di atas target, compact chunk lebih tua berikutnya atau ringkas summary sebelumnya.

Summary internal yang direkomendasikan:

~~~json
{
  "userGoals": [],
  "constraintsAndPreferences": [],
  "decisions": [],
  "verifiedFacts": [],
  "artifactsAndIdentifiers": [],
  "completedActions": [],
  "importantToolResults": [],
  "openQuestions": [],
  "nextSteps": [],
  "untrustedExternalContentNotes": []
}
~~~

Summary tidak boleh dinaikkan menjadi system instruction. Serialize sebagai context item berlevel user/data dengan penanda bahwa isinya ringkasan percakapan lama, bukan instruksi baru. Konten web dan tool yang tidak dipercaya harus tetap ditandai untrusted agar prompt injection tidak memperoleh privilege lebih tinggi setelah diringkas.

Jangan hanya memotong N pesan pertama karena dapat memisahkan:

- user message dari assistant response;
- tool call dari tool result;
- keputusan dari alasan pentingnya;
- attachment dari message yang merujuknya.

### 11.9 Failure dan recovery auto-compact

- Jika request compaction gagal, retry paling banyak sekali jika aman dan belum ada output.
- Jika masih di bawah hardStopPercent, pertahankan context lama, tampilkan warning, dan izinkan user mencoba lagi.
- Jika >= hardStopPercent, jangan mengirim request utama yang hampir pasti overflow. Tawarkan `Compact now`, `Start new chat`, `Reduce output reserve`, atau edit contextWindow override.
- Truncation diam-diam dilarang. Jika emergency sliding window akhirnya ditambahkan, harus opt-in, terlihat di UI, dan tetap tidak menghapus history lokal.
- context_length_exceeded memicu refresh metadata model lalu forced preflight. Error dapat berarti contextWindow lokal salah, tokenizer estimate meleset, atau provider memakai limit lebih rendah.
- Compaction yang interrupted disimpan berstatus failed/interrupted dan tidak menjadi active context.
- Satu conversation hanya boleh memiliki satu compaction job aktif.

Manual controls:

- Compact now.
- Auto-compact on/off per conversation.
- Lihat summary yang dipakai untuk local compaction.
- Recompact dari transkrip asli dengan target berbeda.
- Tandai turn atau fact sebagai pinned agar tidak dibuang dari effective context.

### 11.10 Dampak pada cache dan biaya

Compaction sendiri adalah request model dan dapat memakai token atau credit. Simpan usage dan biaya terpisah dari response utama. Footer detail harus membedakan `chat usage` dan `compaction usage`.

Local compaction mengubah prefix prompt sehingga dapat menurunkan prompt-cache hit pada request pertama setelah compaction. Setelah itu, summary yang stabil dan recent tail yang append-only membantu cache kembali. Jangan menjalankan compaction lebih sering dari yang diperlukan.

### 11.11 Privacy dan audit

- Summary lokal adalah data percakapan dan mengikuti retention/delete/export conversation.
- Native opaque item juga dianggap data sensitif walau tidak dapat dibaca aplikasi.
- Menghapus conversation harus menghapus summary, opaque items, dan provenance compaction lokal.
- Export default menyertakan transkrip serta summary yang dapat dibaca, tetapi tidak credential.
- UI menampilkan kapan auto-compact terjadi, metode yang dipakai, range turn, before/after estimate, dan usage request compaction.
- Original transcript selalu menjadi source of truth untuk tampilan dan pencarian lokal.

## 12. Tool calling dan web search

### 12.1 Tool loop

~~~text
Send model request
  -> receive one or more tool calls
  -> validate tool name and JSON arguments
  -> evaluate policy
  -> request user approval if needed
  -> execute tool
  -> cap and sanitize output
  -> append tool result
  -> continue model request
  -> stop on final answer or limit
~~~

Safety limits:

- maksimum tool rounds per user turn, rekomendasi awal 8;
- maksimum parallel calls, rekomendasi awal 3 untuk read-only tools;
- timeout per tool;
- output byte cap;
- total wall-clock cap;
- cancellation propagates ke network dan tool;
- duplicate call ID tidak boleh dieksekusi ulang tanpa idempotency check.

### 12.2 Tool registry

~~~ts
type ToolDefinition = {
  name: string
  description: string
  inputSchema: JsonSchema
  risk: "read-only" | "write" | "dangerous"
  approval: "never" | "ask" | "always"
  execute: (input, context, signal) => Promise<ToolResult>
}
~~~

Model hanya menerima tool yang enabled untuk conversation tersebut.

### 12.3 Web search

MVP/P1 paling portable adalah app-owned function tool:

~~~json
{
  "name": "web_search",
  "description": "Search the public web for current information",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {"type": "string"},
      "count": {"type": "integer", "minimum": 1, "maximum": 10},
      "recencyDays": {"type": ["integer", "null"], "minimum": 1}
    },
    "required": ["query"],
    "additionalProperties": false
  }
}
~~~

Backend search dapat berupa provider pilihan pengguna atau service milik pengguna. Search credential juga harus masuk Keystore.

Hosted web search dari endpoint dapat didukung sebagai mode terpisah jika capability dan event schema diketahui. Jangan menganggap hosted tool OpenAI tersedia di semua endpoint compatible.

### 12.4 Safe URL fetch

fetch_url harus:

- hanya http/https;
- default HTTPS;
- blok localhost, loopback, link-local, private network, dan cloud metadata;
- resolve DNS lalu validasi semua resolved IP;
- validasi ulang setiap redirect;
- batasi redirect;
- batasi response bytes;
- batasi MIME;
- batasi waktu;
- hapus auth header pada cross-host redirect;
- jangan render HTML mentah di WebView tanpa sanitization;
- tandai konten web sebagai untrusted content untuk model.

### 12.5 Prompt injection dan excessive agency

Web content dapat mengandung instruksi berbahaya. System prompt saja bukan security boundary.

Requirement:

- tool permissions ditegakkan di code;
- web content tidak boleh membawa credential;
- read-only web tool tidak boleh otomatis memicu write/dangerous tool tanpa approval baru;
- setiap side effect memerlukan user-visible summary;
- jangan menyediakan open-ended shell jika tool sempit sudah cukup;
- simpan audit event tool;
- rate limit tool calls;
- tool output tidak boleh langsung dianggap command.

## 13. Apakah command sandbox bisa berjalan di Android?

Jawaban singkat: command bisa dijalankan, tetapi sandbox setara desktop tidak otomatis tersedia.

### 13.1 Batas Android

- Setiap Android app berjalan sebagai Linux UID sendiri. Ini mengisolasi aplikasi dari aplikasi lain.
- Semua process di dalam aplikasi yang memakai UID sama tetap dapat mengakses app-private files sesuai permission proses.
- Jadi child process milik aplikasi dapat menjadi ancaman bagi chat DB, cache, dan file aplikasi.
- Android 10 untuk target API 29+ melarang execve langsung dari writable app home. Binary code seharusnya dibundel dalam APK.
- System binaries Android terbatas dan bukan distribusi GNU/Linux lengkap.
- Android dapat membunuh background atau CPU-heavy processes.
- React Native JS tidak menyediakan shell execution API. Diperlukan Kotlin/NDK module atau aplikasi eksternal.

Kesimpulan: ProcessBuilder yang menjalankan toybox bukan secure general-purpose sandbox.

### 13.2 Opsi A: Tanpa shell pada MVP

Kelebihan:

- paling aman;
- paling sedikit dependency;
- mudah masuk Play Store;
- tool dapat dibuat sempit dan dapat diuji.

Rekomendasi: jadikan ini default.

### 13.3 Opsi B: Bundled native commands

Teknik:

- binary tertentu dibundel dalam APK/native library area;
- Kotlin module menjalankan argv;
- workspace dibatasi ke app-private directory.

Keterbatasan:

- bukan package manager;
- binary harus dibangun per ABI;
- command masih memiliki app UID;
- sulit memberi filesystem dan network isolation granular;
- update binary membutuhkan app update;
- tidak cocok untuk arbitrary downloadable executables karena W^X restriction.

Cocok hanya untuk tool sempit, misalnya grep-like search atau archive utility yang benar-benar diperlukan.

### 13.4 Opsi C: Termux bridge

Termux menyediakan Linux environment dan RUN_COMMAND Intent. Third-party app dapat mengirim command jika:

- permission com.termux.permission.RUN_COMMAND dideklarasikan;
- pengguna memberikannya;
- allow-external-apps diaktifkan di Termux;
- package visibility Android dikonfigurasi;
- Termux version mendukung result PendingIntent.

Kelebihan:

- environment dan package manager sudah matang;
- berjalan di UID Termux, terpisah dari app utama;
- stdout, stderr, exit code dapat dikembalikan;
- lebih realistis untuk power user.

Kekurangan:

- dependency aplikasi eksternal;
- onboarding lebih kompleks;
- distribusi Termux dan signing source perlu dijelaskan;
- Android dapat membunuh proses Termux;
- tetap bukan container isolation;
- user memberikan kemampuan arbitrary command ke integrasi.

Policy:

- opt-in;
- default workspace dedicated;
- jangan mount/share chat DB atau credential;
- command preview dan approval;
- timeout dan output cap;
- satu active command per sandbox untuk awal;
- tombol stop;
- audit log;
- cek package/signature jika memungkinkan.

### 13.5 Opsi D: Remote sandbox

Ini adalah rekomendasi untuk execution yang serius.

Client mengirim command ke service sandbox melalui HTTPS/WebSocket. Service membuat container atau microVM ephemeral.

Kontrak minimum:

~~~text
POST   /sandboxes
POST   /sandboxes/{id}/commands
GET    /sandboxes/{id}/commands/{commandId}/events
POST   /sandboxes/{id}/commands/{commandId}/stdin
DELETE /sandboxes/{id}
~~~

Server requirement:

- non-root;
- read-only root filesystem;
- writable workspace terpisah;
- CPU, memory, disk, PID, output, dan time limits;
- network disabled atau allowlist;
- no host socket;
- no app API key by default;
- ephemeral credential scope;
- per-user authorization;
- idempotency key;
- audit;
- automatic cleanup;
- signed upload/download URLs;
- malware and archive-bomb limits.

Kelebihan:

- boundary lebih kuat;
- toolchain lengkap;
- tidak terikat ABI Android;
- process dapat lanjut walau app tutup.

Kekurangan:

- perlu backend;
- biaya;
- latency;
- data keluar perangkat;
- operational security lebih besar.

### 13.6 Opsi E: WASM atau isolated script runtime

Pilihan tengah:

- WASI runtime untuk command terbatas;
- isolated JavaScript engine tanpa React Native bridge;
- Python subset di WebAssembly.

Kelebihan:

- deterministic dan dapat dibatasi;
- tidak perlu arbitrary native exec.

Kekurangan:

- bukan shell Linux penuh;
- package compatibility rendah;
- runtime dan filesystem virtual menambah kompleksitas.

Jangan masukkan sebelum use case jelas.

### 13.7 Interface executor

~~~ts
type SandboxMode = "disabled" | "read-only" | "workspace-write"

type CommandRequest = {
  argv: string[]
  cwd: string
  envAllowlist: Record<string, string>
  timeoutMs: number
  maxOutputBytes: number
  mode: SandboxMode
}

type CommandResult = {
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  truncated: boolean
  enforcement: "remote-isolated" | "termux-separated" | "partial" | "none"
}
~~~

Gunakan argv, bukan shell string, jika command tidak membutuhkan shell grammar. Jika shell string dibutuhkan, tampilkan literal command ke pengguna.

## 14. React Native dan Android stack

### 14.1 Pilihan framework

Rekomendasi awal:

- React Native stable terbaru saat implementation dimulai;
- TypeScript strict;
- New Architecture;
- Expo development build/prebuild boleh digunakan untuk mengurangi boilerplate;
- jangan bergantung pada Expo Go karena custom Kotlin module diperlukan;
- jika command executor menjadi MVP, React Native Community CLI dapat dipilih agar native control lebih langsung.

Decision gate:

- Jika MVP hanya chat, model JSON, dan tools HTTP: Expo prebuild adalah jalur paling pendek.
- Jika MVP wajib Termux/foreground streaming/native executor: bare React Native lebih mudah dipahami dan di-debug.

### 14.2 Native modules

Kotlin TurboModule minimal:

- StreamHttpModule: OkHttp streaming, event timestamp, cancellation.
- CredentialModule atau secure storage library yang membungkus Keystore.
- CatalogFileModule jika file API library tidak memenuhi atomic write.
- TermuxExecutorModule hanya saat P2.
- ForegroundGenerationService saat background continuation diperlukan.

### 14.3 Storage

| Data | Storage |
|---|---|
| API/search/sandbox credentials | Android Keystore-backed secure storage |
| Endpoint profile non-secret | App-private JSON atau settings table |
| Model defaults | Bundled JSON |
| Live model cache | App-private JSON |
| Model overrides | App-private JSON plus import/export |
| Conversations/events | SQLite |
| Attachments | App-private files, content URI, lifecycle managed |
| Logs | Ring buffer ter-redact, opt-in export |

### 14.4 Android versions

Rekomendasi:

- compileSdk dan targetSdk mengikuti latest stable/Play requirement saat implementation;
- minSdk diputuskan dari target pengguna, rekomendasi awal 26;
- uji minimal Android 10 karena W^X behavior;
- uji Android 12+ untuk process/background restrictions;
- uji Android 15+ untuk foreground service timeout behavior;
- uji Android 17 behavior jika target release sudah mengharuskan.

### 14.5 Networking

- HTTPS wajib secara default.
- Android 9+ memblokir cleartext secara default.
- Jangan menyediakan trust-all-certificate toggle.
- Untuk endpoint self-signed, P1 dapat mendukung imported CA atau per-endpoint certificate pin.
- HTTP localhost/LAN hanya mode developer dengan warning jelas.
- Dynamic arbitrary HTTP allowlist sulit dilakukan hanya dengan static Network Security Config. Jika global cleartext diaktifkan, code harus tetap menolak host yang tidak diizinkan dan redirect harus divalidasi.
- Jangan certificate-pin endpoint AmanAI jika aplikasi memang harus mendukung custom endpoint secara luas, kecuali pin bersifat per-profile dan memiliki recovery.

### 14.6 Background behavior

Pilihan MVP paling sederhana:

- generation dijamin saat app foreground;
- jika process hilang, turn menjadi interrupted;
- partial content tetap ada;
- user dapat retry.

Jika harus lanjut saat app background:

- gunakan foreground service dengan notification;
- tampilkan model, status, dan Cancel action;
- mulai service akibat direct user action;
- stream I/O tidak berjalan di main thread;
- patuhi foreground service type dan batas versi Android;
- jangan menggunakan WorkManager untuk interactive token stream.

## 15. Security dan privacy

### 15.1 Credential

- Jangan bundle shared API key.
- Jangan simpan key di AsyncStorage, model JSON, endpoint JSON, Redux persistence, atau logs.
- Android Keystore menyimpan encryption key non-exportable.
- Secure storage record berisi encrypted API key dan credential ID.
- Biometric lock opsional.
- Redact pola Authorization, x-api-key, sk-*, bearer token, dan custom secret header.
- Export config hanya membawa credentialRef placeholder.

Jika produk memakai satu API key milik developer untuk semua pengguna, dibutuhkan backend proxy. Tidak ada cara aman menyembunyikan shared secret di APK.

### 15.2 App data

- Default Android app-private storage.
- Exclude credential dan sensitive cache dari Android Auto Backup.
- Tentukan apakah chat ikut backup. Default konservatif: tidak.
- Delete conversation harus benar-benar menghapus DB rows dan attachment references.
- Clear all data harus tersedia.
- Debug logging body default off.
- Crash report tidak boleh membawa prompt, response, headers, atau tool output tanpa explicit opt-in.

### 15.3 Tool security

- Default deny untuk tool yang belum dikenal.
- Read-only tool dapat auto-run jika user mengaktifkan.
- Write dan dangerous selalu ask.
- Approval menyebut tool, arguments, target, dan side effect.
- Approval berlaku satu call secara default.
- No hidden auto-approval dari model text.
- Tool schema validation wajib.
- Output sanitization wajib.
- Tool result size cap wajib.
- Prompt injection dianggap tidak dapat dieliminasi penuh.

### 15.4 Command security

- disabled by default;
- no credential forwarding;
- env allowlist, bukan inherit;
- dedicated workspace;
- path traversal protection;
- no symlink escape untuk file tools;
- fail closed jika isolation yang diminta tidak tersedia;
- hard timeout;
- output cap;
- process count cap di remote;
- network default off di remote;
- destructive command approval;
- audit command dan result;
- no retry side-effect command otomatis.

### 15.5 Endpoint and redirect security

- URL parser terstruktur, bukan string concatenation bebas.
- Strip credential pada cross-origin redirect.
- Pertimbangkan disable redirect untuk POST model request.
- Cap response header dan body error.
- Jangan menampilkan raw HTML error.
- SNI/TLS hostname verification tetap aktif.

## 16. Reliability dan performance

### 16.1 Retry

Retry otomatis hanya jika:

- request belum menghasilkan event model/tool;
- error network transient;
- atau status termasuk 429/502/503;
- method dan side effect aman;
- retry count kecil, rekomendasi 2;
- exponential backoff dengan jitter;
- Retry-After dihormati.

Jangan retry:

- setelah token/tool call diterima;
- 400;
- 401/402/403;
- tool side effect;
- user cancellation.

### 16.2 Long conversation

- Virtualized list.
- Pagination dari SQLite.
- Render markdown hanya untuk item visible.
- Debounce DB writes, tetapi transaction setiap stream batch.
- Jangan menyimpan seluruh transcript dalam global state.
- Virtualization history tetap bekerja walau effective model context sudah dikompaksi.
- Attachment thumbnail dan original file lifecycle dipisahkan.

### 16.3 Model refresh

- Render cache dahulu.
- Fetch satu kali per cold start.
- Coalesce concurrent refresh.
- Honor ETag jika server menyediakan.
- Jika tidak, compare content hash.
- Jangan menyebabkan model picker berkedip atau kehilangan selection.

### 16.4 Limits

Recommended initial defaults:

| Limit | Nilai awal |
|---|---|
| Connect timeout | 15 detik |
| Model request idle read timeout | Tidak pendek, stream-aware |
| Error body | 256 KB |
| Tool output to model | 64 KB per call |
| Tool rounds | 8 |
| Parallel read-only tools | 3 |
| URL fetch | 2 MB text |
| Search results | 10 |
| Local log ring | 2 MB |

Semua limit harus dapat dituning melalui code config, tidak perlu semua menjadi setting pengguna.

## 17. Error UX dan diagnostics

Error card harus menjawab:

- request ke endpoint mana;
- protocol apa;
- model apa;
- HTTP status;
- provider error code;
- request ID jika ada;
- apakah retry aman;
- setting mana yang mungkin salah.

Contoh:

~~~text
Model tidak tersedia untuk API key ini
Endpoint: AmanAI
Model: amanai/example
HTTP 403, model_forbidden

Refresh model list atau pilih model lain.
~~~

Diagnostic export:

- app version;
- Android version;
- endpoint hostname, tanpa path sensitif;
- protocol;
- model ID;
- merged model metadata dengan provenance;
- event sequence tanpa message content;
- timing;
- status/error;
- redacted headers;
- tidak ada credential.

## 18. Accessibility dan mobile UX

- Touch target minimal 48 dp.
- Screen reader label untuk model picker, stop, retry, stats pills, dan tool approval.
- Dynamic font size tanpa memotong code block controls.
- Dark/light theme.
- High contrast untuk error dan active streaming state.
- Jangan hanya memakai warna untuk exact/estimated/unknown.
- Keyboard dan IME tidak boleh menutupi composer.
- Draft disimpan.
- Haptic hanya untuk meaningful completion/error dan dapat dimatikan.
- Stats footer dapat disembunyikan.
- Context pill memiliki screen reader label lengkap, misalnya `Context 62 percent used, 38 percent remaining, estimated`.
- Thinking selector menggunakan bottom sheet dengan deskripsi singkat per level.

## 19. Test strategy

### 19.1 Unit tests

- Base URL normalization.
- Endpoint path joining.
- Credential redaction.
- Standard OpenAI model list parsing.
- AmanAI enriched model list parsing.
- Three-layer merge precedence.
- null, absent, invalid, and unknown fallback.
- User custom model.
- Removed model tombstone.
- JSON schema migration.
- Corrupt JSON backup recovery.
- Responses event parsing.
- Chat Completions chunk parsing.
- Fragmented tool arguments.
- Usage normalization.
- TPS, TTFT, cache hit formula.
- No false 0% cache.
- Context used/remaining formula dengan output reserve dan safety margin.
- Context state exact, estimated, dan unknown.
- Policy validation: target < trigger < hard stop.
- Compaction range tidak memisahkan tool call dari tool result.
- Local summary tidak dikirim sebagai system instruction.
- Hysteresis mencegah compaction berulang setiap turn.
- Retry eligibility.
- Tool policy and call ID dedupe.
- URL SSRF checks.

### 19.2 Contract tests dengan fake server

Fake server fixtures:

- first-run model discovery dengan Bearer dan x-api-key;
- standard GET /models yang hanya berisi metadata dasar;
- enriched GET /models dengan field tambahan;
- models path 404 dan credential 401;
- valid non-stream response;
- valid SSE;
- slow first token;
- fragmented UTF-8 and JSON;
- heartbeat;
- tool call;
- parallel tools;
- usage only at end;
- missing usage;
- cached token variants;
- unknown event;
- abrupt disconnect;
- malformed event;
- 401, 402, 403, 404, 429, 502, 503;
- redirect to another host;
- model list empty;
- model list enriched and standard;
- native compaction supported, unsupported, malformed, dan interrupted;
- context_length_exceeded lalu local compaction recovery;
- summary masih terlalu besar setelah compaction;
- usage compaction dipisahkan dari usage chat.

### 19.3 Android tests

- Keystore create/read/delete.
- Key tidak muncul di files, logs, dan backup.
- Atomic JSON replace.
- Import/export via Storage Access Framework.
- Process death saat streaming.
- Rotation/configuration change.
- Background/foreground transition.
- Network switch Wi-Fi ke mobile.
- Cancel dari notification.
- Termux missing, permission denied, result success, timeout, dan cancellation jika P2.

### 19.4 UI tests

- Fresh install membuka endpoint form tanpa menghubungi provider default.
- Connect & discover menampilkan model dari custom base URL.
- Model discovery error mempertahankan input form dan tidak membuat profile duplikat.
- Model cache tampil sebelum refresh selesai.
- Model picker update tanpa mengganti active stream.
- Reasoning options sesuai model.
- Missing field menampilkan Unknown.
- Stats footer exact dan unavailable states.
- Context pill used/left, exact/estimated/unknown, dan critical state.
- Auto-compact separator tanpa menyembunyikan transcript lama.
- Manual Compact now dan failure choices.
- Tool approval.
- Partial response after restart.
- Long markdown/code performance.
- Accessibility traversal.

### 19.5 Real endpoint smoke tests

Dengan key dari environment CI/private device:

- GET AmanAI models.
- One Responses non-stream request.
- One Responses stream request.
- One forced function tool call pada model yang didokumentasikan mendukung.
- Reasoning effort per advertised level, sampled untuk biaya.
- Usage fields capture.
- 402 behavior menggunakan mocked server, bukan menghabiskan credit.

Jangan menyimpan key atau transcript smoke test di repository.

## 20. Acceptance criteria per milestone

### Milestone A: Endpoint dan model catalog

- Fresh install meminta base URL dan API key, bukan langsung mengasumsikan AmanAI.
- Custom HTTPS endpoint dapat Connect & discover melalui GET /models.
- Endpoint standar yang hanya mengembalikan ID model tetap dapat membuka model picker.
- AmanAI dapat connect sebagai salah satu endpoint dan enriched fields-nya muncul.
- Tidak ada flow inti yang membutuhkan hostname amanai.dev.
- Key tersimpan di Keystore.
- Cold start menampilkan cached model list lalu refresh.
- 401, 404, TLS failure, empty list, dan invalid schema memiliki error yang dapat ditindaklanjuti.
- Override survives refresh.
- Corrupt override tidak merusak last-known-good catalog.
- Missing fields tidak crash.

### Milestone B: Chat streaming

- Responses stream tampil incremental.
- Stop membatalkan socket.
- Partial output tersimpan.
- Retry membuat turn baru yang jelas.
- Error status dan code tampil.
- Model dan reasoning config tersimpan per turn.

### Milestone C: Metrics

- TTFT dicatat.
- TPS menggunakan decode time.
- Usage exact dipakai jika ada.
- Cache hit hidden jika data absent.
- Per-turn dan session detail cocok dengan fixture.
- Tidak ada double-count cached tokens.

### Milestone C2: Context management

- Context pill menampilkan used dan left percent sebelum send.
- Perhitungan memakai effective input, output reserve, dan safety margin.
- Unknown context tidak menampilkan persentase palsu.
- Auto-compact terpicu pada threshold dan mencapai target occupancy pada fixture.
- Original transcript tetap lengkap setelah local compaction.
- Pending tool transaction tidak pernah terpotong.
- Native compaction hanya dipakai jika capability supported.
- AmanAI default memakai local compaction sampai native capability terverifikasi.
- Compaction usage dan before/after occupancy dapat diaudit.
- Failure di hard stop tidak melakukan silent truncation.

### Milestone D: Tool loop

- Function call arguments dirakit dari chunks.
- Invalid JSON ditolak.
- Unknown tool ditolak.
- Approval berlaku sebelum execution.
- Tool result kembali ke model.
- Loop berhenti pada final answer atau tool-round limit.
- Duplicate side effect tidak dieksekusi saat resume.

### Milestone E: Sandbox

- Executor disabled adalah default.
- Termux atau remote backend memiliki explicit setup.
- App credential tidak masuk executor.
- Workspace terpisah.
- Timeout, cancel, output cap, dan audit bekerja.
- Requested confinement yang tidak tersedia menghasilkan failure, bukan fallback diam-diam.

## 21. Open decisions sebelum implementation plan

Keputusan yang sudah ditetapkan:

- aplikasi adalah generic custom-endpoint client;
- first launch meminta endpoint dan API key milik pengguna;
- model ditemukan otomatis melalui GET /models;
- AmanAI dipakai untuk dokumentasi, reference profile, dan smoke test proyek pribadi, bukan sebagai dependency wajib;
- MVP memakai satu active endpoint, sedangkan penyimpanan beberapa profile dan endpoint switcher masuk P1.

Keputusan yang benar-benar memengaruhi plan:

1. Apakah app harus tetap generate saat layar mati/background pada MVP?
2. Apakah image/file upload masuk MVP?
3. Web search memakai service apa, dan apakah key milik user atau backend milik developer?
4. Apakah app akan didistribusikan lewat Play Store, sideload, atau keduanya?
5. Minimum Android version yang ingin didukung?
6. Apakah conversation perlu encrypted database dari awal?
7. Apakah Termux integration merupakan fitur inti atau advanced opt-in?
8. Apakah remote sandbox backend sudah tersedia atau perlu dibangun?
9. Apakah Responses previous_response_id dapat diasumsikan stabil di AmanAI untuk semua model, atau stateless replay menjadi default?
10. Apakah raw reasoning content boleh ditampilkan/disimpan, atau hanya reasoning summary?
11. Apakah endpoint HTTP lokal harus didukung pada release build?
12. Apakah biaya auto-compaction boleh memakai model aktif, atau harus ada model ringkas khusus yang dipilih user?

Default jika belum diputuskan:

- satu active endpoint, struktur siap multi-profile;
- foreground-only streaming untuk MVP;
- text-only MVP;
- web search P1;
- Play Store compatible;
- minSdk 26;
- app-private SQLite tanpa SQLCipher, API key tetap Keystore;
- command executor disabled;
- previous_response_id untuk AmanAI, fallback stateless;
- reasoning summary saja;
- HTTPS only pada release;
- auto-compact aktif, trigger 80%, target 55%, hard stop 95%;
- local compaction untuk AmanAI sampai native capability dinyatakan supported;
- model aktif dipakai untuk compaction agar tidak menambah asumsi compatibility.

## 22. Risiko utama

| Risiko | Dampak | Mitigasi |
|---|---|---|
| OpenAI-compatible tidak benar-benar kompatibel | Request gagal | Adapter dan explicit compat profile |
| Model metadata kosong | UI salah atau crash | Unknown state dan override JSON |
| Refresh menimpa edit | Kehilangan config | Tiga lapis JSON |
| API key bocor | Account compromise | Keystore, redaction, no body logs |
| Background stream mati | Response interrupted | Partial persistence, foreground service P1 |
| Tool prompt injection | Side effect | Least privilege, approval, tool policy |
| Local shell membaca app data | Secret/data exposure | Jangan local shell MVP, separate executor |
| Auto retry menggandakan aksi | Double billing/side effect | Retry hanya sebelum output |
| Cached token double-count | Statistik salah | Usage normalization fixtures |
| Context estimate terlalu rendah | Request overflow | Conservative estimate, output reserve, safety margin, early trigger |
| Context estimate terlalu tinggi | Compaction terlalu cepat | Tampilkan quality, gunakan provider usage/tokenizer saat tersedia |
| Summary kehilangan detail | Jawaban berikutnya salah | Structured summary, pinned facts, recent tail, original transcript, audit |
| Prompt injection naik privilege saat diringkas | Tool misuse | Summary sebagai user/data context, preserve untrusted labels |
| Compaction menambah biaya | Credit tidak terduga | Threshold, usage terpisah, setting on/off, warning |
| Model dihapus provider | History rusak | Tombstone/unavailable state |
| Huge markdown/history | UI jank/OOM | Virtualization, batching, pagination |
| Cleartext/self-signed endpoint | MITM | HTTPS default, no trust-all |

## 23. Rekomendasi struktur repository saat mulai coding

Ini bukan scaffolding wajib, tetapi boundary berikut cukup:

~~~text
src/
  app/
  features/
    chat/
    models/
    settings/
    tools/
  services/
    catalog/
    context/
    credentials/
    persistence/
    transport/
  domain/
    model.ts
    conversation.ts
    context.ts
    tool.ts
    usage.ts
android/
  app/src/main/java/.../
    streaming/
    credentials/
assets/
  model-defaults.json
schemas/
  model-overrides.schema.json
~~~

Jangan membuat plugin framework, dependency injection container, atau multi-package monorepo untuk MVP.

## 24. Sumber primer

### AmanAI

- API reference: https://ai.amanai.dev/docs/reference/
- Billing dan cache read: https://ai.amanai.dev/docs/billing/
- Model catalog documentation: https://ai.amanai.dev/docs/models/
- Quickstart and reasoning effort: https://ai.amanai.dev/docs/
- Live model endpoint: https://api.amanai.dev/v1/models
- Official Pi bootstrap showing live catalog to JSON, backup, atomic replace, and fallback handling: https://ai.amanai.dev/setup/pi.sh

### OpenAI API baseline

- Models API: https://developers.openai.com/api/reference/ruby/resources/models
- Responses create API: https://developers.openai.com/api/reference/cli/resources/responses/methods/create
- Responses compact API: https://developers.openai.com/api/reference/java/resources/responses/methods/compact
- Model and reasoning guidance: https://developers.openai.com/api/docs/guides/latest-model
- Prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching

### Repo pembanding

- OpenAI Codex Responses client cache key: https://github.com/openai/codex/blob/main/codex-rs/core/src/client.rs
- DeepSeek context caching: https://api-docs.deepseek.com/guides/kv_cache/

- Hermes Agent README at inspected commit: https://github.com/NousResearch/hermes-agent/blob/682a95258ce9e877cfb607a5ada6436183efdebb/README.md
- Hermes Android/Termux guide: https://github.com/NousResearch/hermes-agent/blob/682a95258ce9e877cfb607a5ada6436183efdebb/website/docs/getting-started/termux.md
- Hermes security guide: https://github.com/NousResearch/hermes-agent/blob/682a95258ce9e877cfb607a5ada6436183efdebb/website/docs/user-guide/security.md
- Hermes terminal tools: https://github.com/NousResearch/hermes-agent/blob/682a95258ce9e877cfb607a5ada6436183efdebb/website/docs/user-guide/features/tools.md
- DeepSeek Harness README: https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/README.md
- DeepSeek custom providers guide: https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/docs/user/guide/providers.md
- DeepSeek sandbox design: https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/docs/subsystems/sandbox.md
- DeepSeek stats UI: https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/packages/client/ui-chat/src/client/chat/StatsPills.tsx
- DeepSeek TPS calculation: https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/packages/client/ui-chat/src/client/contract/turn-metrics.ts
- OpenCodeX README: https://github.com/thyjeff/opencodex/blob/bec5875825b8ed709edadaef2367b67ef1c68ae4/README.md
- OpenCodeX protocol translation: https://github.com/thyjeff/opencodex/blob/bec5875825b8ed709edadaef2367b67ef1c68ae4/src/opencodex_proxy/protocol.py

### Android dan React Native

- Android application sandbox: https://developer.android.com/guide/components/fundamentals
- Android 10 executable restriction: https://developer.android.com/about/versions/10/behavior-changes-10#execute-permission
- Android Keystore: https://developer.android.com/privacy-and-security/keystore
- Android network security config: https://developer.android.com/privacy-and-security/security-config
- Android foreground services: https://developer.android.com/develop/background-work/services/fgs
- React Native networking: https://reactnative.dev/docs/network
- React Native security: https://reactnative.dev/docs/security
- React Native Turbo Native Modules: https://reactnative.dev/docs/turbo-native-modules-introduction

### Termux dan tool security

- Termux RUN_COMMAND Intent: https://github.com/termux/termux-app/wiki/RUN_COMMAND-Intent
- Termux app repository and Android process caveats: https://github.com/termux/termux-app
- Termux execution environment: https://github.com/termux/termux-packages/wiki/Termux-execution-environment
- OWASP Excessive Agency: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
- OWASP Prompt Injection: https://genai.owasp.org/llmrisk/llm01-prompt-injection/

## 25. Kesimpulan akhir

Requirement yang paling menentukan bukan tampilan chat, tetapi normalization layer:

- satu model catalog ter-normalisasi dari live JSON, override, dan defaults;
- satu event model internal untuk Responses dan Chat Completions;
- satu usage model untuk TPS dan cache;
- satu context manager untuk meter, output reserve, dan auto-compact yang dapat diaudit;
- satu tool policy boundary;
- satu command executor interface yang default-nya disabled.

Dengan boundary tersebut, aplikasi dapat langsung menjadi generic OpenAI-compatible mobile client yang divalidasi pertama kali menggunakan AmanAI, tanpa mengunci runtime ke AmanAI dan tanpa harus menyalin kompleksitas Hermes atau DeepSeek Harness.
