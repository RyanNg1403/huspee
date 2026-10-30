import { describe, expect, it } from 'vitest';
import { closestProducts, matchProducts, resolveVoucher, spokenNumber } from '../../apps/api/src/assistant/tools/speech-resolution.js';

describe('speech resolution', () => {
  it('resolves spoken voucher numbers and refuses equally close codes', () => {
    for (const heard of ['tech năm mươi k', 'tech 50 k', 'TECH50K']) {
      expect(resolveVoucher(heard, ['TECH50K']).resolution?.resolved_to).toBe('TECH50K');
    }
    expect(resolveVoucher('TECH50X', ['TECH50K', 'TECH50M'])).toEqual({ candidates: ['TECH50K', 'TECH50M'] });
    expect(resolveVoucher('TECH50X', ['TECH50K', 'TECH51M']).candidates).toEqual(['TECH50K', 'TECH51M']);
    expect(resolveVoucher('other', ['TECH50K']).resolution).toBeUndefined();
    expect(spokenNumber('one two')).toBeUndefined();
  });
  it('matches accent-insensitive and misspelled product tokens without selecting among matches', () => {
    const products = [{ name: 'Điện thoại Galaxy A' }, { name: 'Điện thoại Galaxy B' }, { name: 'Tai nghe' }];
    expect(matchProducts('dien thoai galaxi', products)).toEqual(products.slice(0, 2));
    expect(matchProducts('tai nghe', products)).toEqual(products.slice(2));
  });
  it('offers the closest products when speech garbles part of a name', () => {
    const products = [{ name: 'Tai nghe Bluetooth Xiaomi Redmi Buds 5' }, { name: 'Tai nghe Sony WH-1000XM5' }, { name: 'Ốp lưng iPhone' }];
    expect(matchProducts('Tai nghe Xiaomi ZP4N5', products)).toEqual([]);
    expect(closestProducts('Tai nghe Xiaomi ZP4N5', products)).toEqual([products[0]]);
    expect(closestProducts('máy giặt', products)).toEqual([]);
    expect(closestProducts('tai nghe abc xyz qqq', products)).toEqual([]);
  });
  it('accepts Vietnamese and English spoken quantities', () => {
    expect(spokenNumber('hai mươi lăm')).toBe(25);
    expect(spokenNumber('twenty five')).toBe(25);
    expect(spokenNumber('một trăm linh hai')).toBe(102);
    expect(spokenNumber('many')).toBeUndefined();
  });
});
