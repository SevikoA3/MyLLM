# AGENTS.md

Panduan kerja untuk agent yang mengerjakan repository MyLLM.

## 1. Dokumen sumber

| Dokumen | Isi | Kapan dibaca |
|---|---|---|
| `DESIGN.md` | Arah visual produk, tipografi, warna, dan perilaku komponen | Sebelum mengubah UI, layout, atau styling |
| `PLAN.md` | Kontrak executor, keputusan default, urutan fase, exit gate, definition of done | Sebelum mengerjakan fase apa pun |
| `graphify-out/graph.json` | Navigation index for codebase structure and relationships | Before locating a change or tracing a flow |
| `RESEARCH_REACT_NATIVE_ANDROID_LLM_CLIENT.md` | Riset requirement dan keputusan teknis | Saat butuh alasan di balik sebuah keputusan |
| `README.md` | Perintah, versi toolchain, catatan styling dan development build | Saat menjalankan atau menambah dependency |

When `graphify-out/graph.json` exists, start codebase exploration with `graphify query "<question about the codebase>"`. Use the returned paths to read the relevant source. The graph is a navigation index, not a source of truth, so verify important behavior and relationships in source. If the graph is missing, unhelpful, or stale, search narrowly with `rg` and `rg --files`.

For UI changes, read `DESIGN.md`. Follow its direction without changing behavior specified by `PLAN.md`.

## 1A. Prioritas dokumen

- `PLAN.md` mengatur requirement, fase, default produk, dan exit gate.
- `AGENTS.md` mengatur perilaku agent dan batas kerja repository.
- `graphify-out/graph.json` aids navigation, but its claims must be verified against source.
- Jika dokumen bertentangan, jangan menebak. Laporkan konflik dan minta keputusan.

## 1B. Batas eksekusi lokal

Agent tidak boleh menjalankan Expo atau build Android. Jangan menjalankan `expo`, `npx expo`, `expo prebuild`, `expo run:*`, `npx expo-doctor`, `npm run doctor`, bundler, emulator, device check, Gradle, APK, atau AAB.

Pemeriksaan yang boleh dijalankan agent hanya TypeScript, ESLint langsung, Jest, dan contract test Node. Pemilik proyek menjalankan pemeriksaan Expo, device, emulator, prebuild, dan build Android secara manual.

Use English for all user-facing UI copy, accessibility labels, error copy added by the agent, and new Markdown instructions.

## 2. Kontrak wajib dari PLAN.md

Aturan berikut diambil dari bagian 2 PLAN.md dan tidak boleh dilanggar:

1. Kerjakan fase secara berurutan. Jangan mulai fase berikutnya sebelum exit gate fase aktif lulus.
2. Jalankan ESLint langsung, typecheck, dan test yang relevan sebelum menandai langkah selesai.
3. Pertahankan kode dalam keadaan siap dibuild setelah setiap fase. Build aktual diverifikasi pemilik proyek.
4. Jangan menambahkan Redux, Zustand, ORM, Axios, EventSource package, dependency injection container, UI framework, monorepo, atau plugin framework tanpa bukti kebutuhan.
5. Jangan membuat interface dengan satu implementasi. Refactor menjadi interface saat implementasi kedua benar-benar ditambahkan.
6. Jangan menyimpan API key, prompt, response, atau tool output di log.
7. Jangan mengubah model ID yang diberikan endpoint.
8. Jangan menganggap field yang hilang bernilai false atau nol. Gunakan null atau unknown.
9. Jangan melakukan silent truncation, silent protocol fallback, atau silent security downgrade.
10. Jangan melakukan request billable untuk capability probing.
11. Jika sebuah gate gagal, perbaiki fase aktif. Jangan menutupinya dengan implementasi fase berikutnya.

Default produk yang belum diputuskan ada di bagian 3 PLAN.md. Gunakan default itu, jangan mengarang keputusan baru.

## 3. Struktur dan arah dependency

~~~text
app/ (route tipis)
  -> src/features/ (UI dan orkestrasi layar)
       -> src/domain/ (tipe dan pure logic)
       -> src/services/ (I/O)
       -> src/ui/ (token visual)
~~~

- `src/domain` tidak mengimpor layer lain dan tidak melakukan I/O.
- `src/services` boleh mengimpor `src/domain`. Native module dimuat lazy di dalam fungsi supaya helper murni tetap dapat diuji di luar React Native.
- `src/features` boleh mengimpor `domain`, `services`, dan `ui`.
- `app/` hanya menyusun screen dan dependency, boleh berupa re-export.
- Jangan membuat barrel `index.ts`. Jangan membuat folder `utils`. Helper tinggal di domain yang memakainya.
- Buat folder ketika fase pertama kali membutuhkannya, bukan sebelumnya.

Tulis komentar yang menjelaskan alasan sebuah keputusan, bukan yang mengulang isi kode. Ikuti gaya komentar berkas di sekitarnya (bahasa Indonesia, ringkas, satu sampai tiga baris).

## 4. Perintah

| Perintah | Fungsi |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, TypeScript strict |
| `npx eslint .` | ESLint langsung tanpa menjalankan Expo |
| `npm run test:ci` | Jest sekali jalan |
| `npm test` | Jest watch mode |
| `npm run test:server` | Contract test fake endpoint |
| `npm run test:transport` | Contract test transport discovery |
| `npm run test:onboarding` | Smoke test connect dan discover |
| `npx expo-doctor` | Dijalankan manual oleh pemilik proyek, bukan agent |
| `node tools/exit-gate.mjs` | Bukti exit gate Phase 2 |

Sebelum menandai sebuah langkah selesai, jalankan minimal:

~~~sh
npm run typecheck
npx eslint .
npm run test:ci
~~~

Tambahkan test contract Node bila perubahan menyentuh `src/services/transport` atau `src/features/setup/onboarding.ts`.

## 5. Test

Ada dua jalur test dan keduanya memakai kode produksi, bukan tiruan.

All tests live under `test/`. Jest tests mirror the source layout, for example `test/services/persistence/catalog-store.test.ts`. Node contract tests live in `test/contract/`. Native modules and pure helpers remain separate so Jest tests do not require a React Native environment.

Contract test Node menjalankan hasil kompilasi dari `.tests-build/`, yang dibuat `tools/build-tests.mjs`. Modul yang diuji harus terdaftar di `ENTRIES`, modul native yang tidak tersedia di Node ditambal lewat `STUBS`. Folder `.tests-build/` tidak di-commit.

Aturan test:

- Gunakan hanya API key palsu. Jangan pernah mengisi credential nyata ke fixture atau test.
- Jangan menulis test yang menyalin mapping produksi. Impor normalizer atau schema yang sama seperti kode aplikasi.
- Test harus mengunci perilaku yang diminta, bukan mencerminkan implementasi.
- Jangan menghapus test yang ada tanpa alasan yang bisa dijelaskan.

## 6. Keamanan

- API key hanya di Keystore lewat `src/services/credentials/store.ts`. Profile endpoint, activeModelId, dan pesan error tidak boleh memuat API key.
- Setiap teks yang mungkin memuat secret lewat `redactText` di `src/domain/error.ts`.
- Credential hanya dikirim ke origin yang tertulis di profile. Redirect tidak diikuti.
- HTTPS selalu diterima. Cleartext HTTP hanya untuk host loopback pada build development.
- Jangan membuat variabel `EXPO_PUBLIC_*` untuk credential karena nilai tersebut ikut ter-bundle ke dalam APK.
- Sebelum release, jalankan pemeriksaan bagian 31 PLAN.md pada build log, source tree, exported config, dump SQLite, model JSON, dan diagnostic export.

## 7. Gaya kode

- TypeScript strict, tanpa `any` implisit. Validasi boundary dengan zod seperti pada `domain/endpoint.ts` dan `domain/catalog.ts`.
- Field yang hilang bernilai null atau unknown. Jangan mengisi default palsu.
- Styling lewat kelas Tailwind dan NativeWind. Token visual ada di `src/ui/tokens.ts`.
- Jangan menambah dependency pada fase yang belum memerlukannya. Setelah menambah atau mengubah dependency, jalankan `npx expo-doctor` dan catat versi aktual jika berpengaruh pada bagian Generated toolchain README.md.
- Pin `nativewind` pada `5.0.0-rc.0`, `react-native-css` pada `3.1.0-rc.0`, `tailwindcss` pada `4.1.12`, dan `lightningcss` pada `1.30.1`. Jangan mengganti `global.css` dengan satu `@import "tailwindcss"`.

## 8. Cara menyelesaikan tugas

1. Tentukan fase yang sedang aktif dari checklist di PLAN.md.
2. Baca bagian fase tersebut beserta exit gate dan daftar do not build yet.
3. Find related files with `graphify query` when the graph exists, then verify the source. Use a narrow source search when the graph is missing or unhelpful.
4. Sebutkan asumsi jika ada keputusan yang belum tercantum di PLAN.md. Jika bertentangan dengan default, hentikan dan tanyakan.
5. Kerjakan hanya scope fase aktif. Jangan mempersiapkan abstraksi untuk fase berikutnya.
6. Jalankan typecheck, lint, dan test yang relevan. Perubahan docs-only tidak memerlukan pemeriksaan source code.
7. Perbarui checklist PLAN.md setelah verifikasi, bukan sebelum.
8. After source changes that affect structure, responsibilities, dependencies, or runtime flow, refresh the graph with `graphify update .`. After changes to indexed documents, or when an incremental update cannot represent a change, run the full `/graphify .` workflow. Do not edit generated graph files manually.
9. Pastikan `git diff` hanya berisi perubahan yang terkait tugas.

## 9. Larangan

- Jangan commit folder `android.env/`, `ios/`, `.expo/`, `.tests-build/`, `node_modules/`, `dist/`, dan `data/`.
- Jangan menambahkan fitur, dependency, atau abstraksi di luar fase yang sedang dikerjakan.
- Jangan menandai checklist selesai sebelum verifikasi dijalankan.
- Jangan menutupi gate yang gagal dengan pekerjaan fase berikutnya.
- Jangan merapikan kode, komentar, atau format berkas yang tidak berkaitan dengan permintaan.
