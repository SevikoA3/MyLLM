import { titleFromPrompt } from './conversation';

describe('titleFromPrompt', () => {
  it('memakai baris pertama tanpa request tambahan', () => {
    expect(titleFromPrompt('  Judul pertama\nbaris lain  ')).toBe('Judul pertama');
  });

  it('membatasi judul panjang', () => {
    expect(titleFromPrompt('a'.repeat(80))).toBe('a'.repeat(57) + '...');
  });
});
