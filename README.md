# MyLLM

Aplikasi Android chat client untuk custom OpenAI-compatible endpoint.

Fase saat ini adalah Phase 1 (domain contracts dan fake endpoint) dari PLAN.md. Kontrak data minimum dan fake OpenAI-compatible server sudah ada; endpoint onboarding, database, dan chat UI belum.

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
| `npm run doctor` | `npx expo-doctor` |

## Domain dan fake endpoint

`src/domain/endpoint.ts` memuat `EndpointProfile`, normalisasi base URL, penggabungan path, dan pembuatan header auth. `src/domain/model-list.ts` memuat schema GET /models dan normalizer yang mengubah field hilang menjadi null atau unknown, bukan false atau nol. `src/domain/error.ts` memuat AppError terstruktur beserta redaksi secret.

Ketentuan yang berlaku sejak fase ini:

- Phase 1 hanya menerima HTTPS. HTTP lokal untuk pengembangan ditambahkan bersama transport chat, bukan dengan menurunkan validasi sekarang.
- Nilai default `chatOutputCap` 8192 berasal dari dokumentasi Chat Completions AmanAI dan dipakai pada Phase 12.
- `nativeContextManagement` bernilai unknown sampai endpoint benar-benar diuji, sehingga compaction lokal menjadi perilaku awal.

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
