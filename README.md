# MyLLM

Aplikasi Android chat client untuk custom OpenAI-compatible endpoint.

Phase 4 selesai. Aplikasi sudah memiliki endpoint onboarding, secure credential, model catalog, model picker, dan chat Responses API non-stream dua arah. Streaming dan database percakapan belum ada.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm start` | Menjalankan Metro dev server |
| `npm run android` | Menjalankan app pada device atau emulator Android |
| `npm run lint` | ESLint lewat `expo lint` |
| `npm run typecheck` | `tsc --noEmit` dengan TypeScript strict |
| `npm test` | Jest dalam watch mode |
| `npm run test:ci` | Jest sekali jalan untuk CI |
| `npm run test:server` | Contract test fake endpoint lewat `node --test` |
| `npm run test:transport` | Contract test transport model discovery terhadap fake endpoint |
| `npm run test:onboarding` | Smoke test alur connect dan discover terhadap fake endpoint |
| `npm run test:responses` | Contract test Responses API non-stream terhadap fake endpoint |
| `npm run smoke:models` | Refresh katalog nyata memakai endpoint lokal di `.env` |
| `npm run smoke:responses` | Dua turn Responses API nyata memakai endpoint lokal di `.env` |
| `npm run doctor` | `npx expo-doctor` |

## Domain dan fake endpoint

`src/domain/endpoint.ts` memuat `EndpointProfile`, normalisasi base URL, penggabungan path, dan pembuatan header auth. `src/domain/model-list.ts` memuat schema GET /models dan normalizer yang mengubah field hilang menjadi null atau unknown, bukan false atau nol. `src/domain/error.ts` memuat AppError terstruktur beserta redaksi secret.

- HTTPS selalu diterima. Cleartext HTTP hanya diterima untuk host loopback pada build development sehingga contract test dapat memakai fake endpoint lokal. Release menolak cleartext HTTP.
- Nilai default `chatOutputCap` 8192 berasal dari dokumentasi Chat Completions AmanAI dan dipakai pada Phase 12.
- `nativeContextManagement` bernilai unknown sampai endpoint benar-benar diuji, sehingga compaction lokal menjadi perilaku awal.

## Onboarding endpoint

Fresh install membuka `app/setup.tsx`, bukan chat kosong. Alurnya:

1. Base URL dinormalisasi, lalu URL final GET /models ditampilkan sebagai preview sebelum request dikirim.
2. Tombol `Connect & discover models` memanggil endpoint dengan timeout 15 detik dan `AbortController`.
3. Credential hanya dikirim ke origin yang tertulis di profile, dan redirect tidak diikuti.
4. Setelah endpoint mengembalikan model, API key ditulis ke Keystore lewat `expo-secure-store` dan profile tanpa secret ditulis ke `expo-sqlite/kv-store`.

Secret hanya berada di Keystore. Profil endpoint, activeModelId, dan pesan error tidak pernah memuat API key. Kegagalan connect tidak menyisakan profile maupun credential, dan field API key dikosongkan setelah setiap percobaan submit.

Model picker menyimpan model ID exact sebagai model aktif. Chat membaca nilai itu tepat sebelum request.

## Chat non-stream

Tab Chat mengirim model exact, input user, `stream: false`, dan `max_output_tokens` 1024 ke Responses API. Pesan user langsung muncul, Send dikunci selama request, dan error dapat dicoba ulang tanpa menggandakan pesan user. Response ID disimpan di memory untuk `previous_response_id` pada turn berikutnya. New chat membersihkan state tersebut. Transcript belum disimpan ke SQLite.

## Contract test Node

Contract test transport, onboarding, dan Responses menjalankan kode produksi hasil kompilasi TypeScript, bukan tiruan:

```sh
npm run test:transport
npm run test:onboarding
npm run test:responses
```

`tools/build-tests.mjs` mengompilasi modul domain, transport, dan onboarding ke `.tests-build/` sebagai ESM, mengganti penanda `__DEV__`, lalu menambahkan ekstensi import agar dapat dimuat Node. Folder hasil kompilasi tidak di-commit. Native module SecureStore dan SQLite dimuat secara lazy supaya modul yang memakainya tetap dapat diuji di luar React Native.

Fake endpoint dijalankan terpisah dari Jest karena server tidak membutuhkan environment React Native:

```sh
node tools/fake-oai-server.mjs
curl -H 'Authorization: Bearer fake-key' http://127.0.0.1:3999/v1/models
curl -X POST -H 'Authorization: Bearer fake-key' -H 'content-type: application/json' \
  -d '{"model":"amanai/glm-5.3","input":"halo","stream":false}' \
  http://127.0.0.1:3999/v1/responses
```

Scenario lain dapat diminta lewat path, misalnya `/v1/scenario/models-401`, `/v1/scenario/models-empty`, `/v1/scenario/models-invalid-json`, atau `/v1/scenario/models-slow`, atau lewat header `X-Scenario`. Server hanya memakai API key palsu; jangan mengisi credential nyata ke fixture.

## Development build

Phase 0 menargetkan development build, bukan Expo Go, agar native module pada fase berikutnya (secure store, SQLite, file system) dapat dipakai. Native folder tidak di-commit; folder `android` dan `ios` dihasilkan oleh Continuous Native Generation.

```sh
npx expo run:android
```

Jalankan ulang perintah ini setiap kali native dependency atau app config berubah.

## Styling

Tailwind CSS dipakai lewat NativeWind v5 RC di atas `react-native-css`. Catatan penting untuk versi ini:

- `nativewind` dan `react-native-css` harus dipin pada pasangan `5.0.0-rc.0` dan `3.1.0-rc.0`.
- `tailwindcss` dipin pada `4.1.12`. Tailwind v4.3 tidak kompatibel dengan paket `@tailwindcss/postcss` yang dipin NativeWind.
- `lightningcss` dipaksa ke `1.30.1` lewat field `overrides` di package.json. Tanpa pin ini build dapat gagal dengan deserialization error pada `global.css`.
- `global.css` mengimpor lapisan theme, preflight, dan utilities secara terpisah. Jangan diganti dengan satu `@import "tailwindcss"` karena urutan cascade-nya berbeda.
- Kelas Tailwind masuk ke bundle lewat Metro, jadi tidak perlu menjalankan Tailwind CLI secara terpisah.

Setelah mengubah konfigurasi styling, jalankan Metro tanpa cache:

```sh
npx expo start --clear
```

## Generated toolchain

| Item | Versi |
|---|---|
| Node.js | 24.14.0 (LTS, dicatat di `.nvmrc`) |
| npm | 11.x |
| Expo SDK | 57.0.23 |
| React Native | 0.86.3 |
| React | 19.2.3 |
| Expo Router | 57.0.21 |
| Reanimated | 4.5.1 dengan react-native-worklets 0.10.1 |
| NativeWind | 5.0.0-rc.0 |
| Tailwind CSS | 4.1.12 |
| Jest | jest-expo 57.0.5 |
| JDK | 17 |
| compileSdk dan targetSdk | 36 (default template Expo SDK 57, hanya terlihat setelah prebuild) |
| minSdk | Default Expo SDK 57. Override ke 26 belum ditambahkan karena menambah dependency `expo-build-properties` hanya untuk satu nilai konfigurasi. |
| Application ID | `com.seviko.myllm` (placeholder internal, wajib dikonfirmasi sebelum distribusi) |

Expo SDK 57 sudah memakai React Native New Architecture dan Hermes secara default, sehingga tidak ada konfigurasi tambahan untuk keduanya.

## Environment

`.env.example` sengaja kosong. Jangan membuat variabel `EXPO_PUBLIC_*` untuk credential karena nilai tersebut ikut ter-bundle ke dalam APK.
