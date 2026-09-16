import type { MergedModel } from '../../domain/catalog-merge';

/** Badge hanya dari metadata yang benar-benar diketahui, bukan tebakan dari nama model. */
export function modelBadges(model: MergedModel): string[] {
  const badges: string[] = [];
  if (model.contextWindow !== null) {
    badges.push(formatTokens(model.contextWindow) + ' ctx');
  } else {
    badges.push('ctx unknown');
  }
  if (model.maxOutputTokens !== null) {
    badges.push(formatTokens(model.maxOutputTokens) + ' out');
  }
  if (model.reasoningEfforts.length > 0) {
    badges.push(
      'reasoning ' + String(model.reasoningEfforts.length) + ' level',
    );
  }
  if (model.inputModalities.some((modality) => modality !== 'text')) {
    badges.push(model.inputModalities.filter((modality) => modality !== 'text').join('/'));
  }
  if (model.pricing !== null) {
    badges.push('pricing ' + model.pricing.version);
  }
  if (model.orphaned) {
    badges.push('riwayat lama');
  }
  return badges;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  }
  return String(value);
}

export function describeRefresh(failure: { kind: string; message: string } | null, lastFetchedAt: string | null): string {
  if (failure !== null) {
    return failure.message + (lastFetchedAt === null ? '' : ' Terakhir berhasil: ' + shortTime(lastFetchedAt) + '.');
  }
  return lastFetchedAt === null ? 'Belum pernah refresh online.' : 'Terakhir diperbarui ' + shortTime(lastFetchedAt) + '.';
}

function shortTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'waktu tidak diketahui' : date.toLocaleString();
}
