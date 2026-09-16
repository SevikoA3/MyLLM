import type { AppError } from '../../domain/error';
import type { ModelRecord } from '../../domain/model';

export type ErrorCopy = {
  title: string;
  body: string;
  retryable: boolean;
};

const FALLBACK: ErrorCopy = {
  title: 'Koneksi gagal',
  body: 'Endpoint tidak dapat dihubungi. Periksa kembali base URL dan jaringan.',
  retryable: true,
};

// Pesan per kategori. URL final selalu ditampilkan supaya salah /v1 langsung terlihat.
export function describe(error: AppError, finalUrl: string): ErrorCopy {
  switch (error.category) {
    case 'auth':
    case 'billing':
      return {
        title: error.category === 'billing' ? 'Credential tidak punya akses' : 'Credential ditolak',
        body:
          'Endpoint menolak API key ini (HTTP ' +
          String(error.httpStatus ?? '-') +
          '). Masukkan key baru lalu hubungkan ulang.',
        retryable: false,
      };
    case 'not-found':
      return {
        title: 'URL model list tidak ditemukan',
        body:
          'URL final: ' +
          finalUrl +
          '. Periksa apakah base URL perlu menyertakan /v1, atau ubah models path di bagian Advanced.',
        retryable: true,
      };
    case 'timeout':
      return {
        title: 'Timeout 15 detik',
        body: 'Endpoint tidak menjawab dalam 15 detik. Periksa jaringan lalu coba lagi.',
        retryable: true,
      };
    case 'tls':
      return {
        title: 'Sertifikat TLS ditolak',
        body: 'Aplikasi tidak memakai sertifikat yang gagal diverifikasi. Perbaiki sertifikat di sisi server.',
        retryable: false,
      };
    case 'schema':
      return {
        title: 'Schema response tidak kompatibel',
        body:
          'Endpoint tidak mengembalikan bentuk OpenAI { data: [ ... ] }. Periksa models path di bagian Advanced.',
        retryable: true,
      };
    case 'model':
      return {
        title: 'Tidak ada model yang bisa dipakai',
        body:
          'Endpoint menjawab tetapi tidak ada satu pun model dengan id yang valid. Periksa akses model pada key ini.',
        retryable: false,
      };
    case 'rate-limit':
    case 'server':
      return { title: 'Endpoint sedang bermasalah', body: error.message, retryable: true };
    case 'request':
      return { title: 'Input endpoint tidak valid', body: error.message, retryable: false };
    case 'network':
      return {
        title: 'Endpoint tidak dapat dihubungi',
        body: error.message + ' (' + finalUrl + ')',
        retryable: true,
      };
    default:
      return FALLBACK;
  }
}

export function modelSummary(models: ModelRecord[]): string {
  return String(models.length) + ' model ditemukan';
}
