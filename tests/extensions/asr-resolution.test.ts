import { describe, expect, it } from 'vitest';
import { closestProducts, matchProducts, rankFaqs, resolveVoucher, spokenNumber } from '../../apps/api/src/assistant/tools/speech-resolution.js';

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
  it('finds products by brand, category and everyday category names in either language', () => {
    const products = [
      { name: 'Samsung Galaxy A55 5G', brand: 'Samsung', category: 'Mobile Phones', categoryVi: 'Điện thoại' },
      { name: 'Củ sạc nhanh Anker 65W GaN 3 cổng', brand: 'Anker', category: 'Chargers & Cables', categoryVi: 'Sạc & Cáp' },
      { name: 'Chuột không dây Logitech M331', brand: 'Logitech', category: 'Mice & Keyboards', categoryVi: 'Chuột & Bàn phím' },
      { name: 'Laptop ASUS Vivobook 15', brand: 'ASUS', category: 'Laptops', categoryVi: 'Laptop' },
      { name: 'Sữa rửa mặt La Roche-Posay', brand: 'La Roche-Posay', category: 'Skincare', categoryVi: 'Chăm sóc da mặt' },
      { name: 'Cáp USB-C TechZone bọc dù sạc 100W', brand: 'TechZone', category: 'Chargers & Cables', categoryVi: 'Sạc & Cáp' },
      { name: 'Giá đỡ laptop TechZone nhôm gập gọn', brand: 'TechZone', category: 'Computer Accessories', categoryVi: 'Phụ kiện máy tính' },
    ];
    expect(matchProducts('Anker charger', products)).toEqual([products[1]]);
    // The cable's name also says "sạc", but it names the cable first.
    expect(matchProducts('charger', products)).toEqual([products[1]]);
    expect(matchProducts('cable', products)).toEqual([products[5]]);
    expect(matchProducts('điện thoại Samsung', products)).toEqual([products[0]]);
    expect(matchProducts('phone', products)).toEqual([products[0]]);
    // "Phụ kiện máy tính" is accessories, named by its head word "phụ kiện", not a computer.
    expect(matchProducts('máy tính xách tay', products)).toEqual([products[3]]);
    expect(matchProducts('máy tính', products)).toEqual([products[3]]);
    expect(matchProducts('phụ kiện máy tính', products)).toEqual([products[6]]);
    expect(matchProducts('Logitech mouse', products)).toEqual([products[2]]);
    // "Chuột & Bàn phím" covers two kinds of product and this one is a mouse: a keyboard only suggests it.
    expect(matchProducts('bàn phím', products)).toEqual([]);
    expect(closestProducts('bàn phím', products)).toEqual([products[2]]);
    expect(closestProducts('Samsung tablet', products)).toEqual([products[0]]);
    // Category words match only as written: "chảo" (pan) is one letter from "chăm" (care).
    expect(matchProducts('chảo', products)).toEqual([]);
    expect(closestProducts('chảo', products)).toEqual([]);
    expect(closestProducts('máy giặt', products)).toEqual([]);
  });
  it('ranks seller FAQs by shared words and never answers with an empty list', () => {
    const faqs = [
      { question: 'Chính sách vận chuyển là gì?', answer: 'Giao trong 24h làm việc.' },
      { question: 'Chính sách bảo hành là gì?', answer: 'Bảo hành chính hãng 12 tháng.' },
      { question: 'What is the return policy?', answer: 'Đổi trả trong 7 ngày.' },
    ];
    expect(rankFaqs('bảo hành sạc Anker', faqs)).toEqual([faqs[1]]);
    expect(rankFaqs('Sạc Anker bảo hành bao lâu?', faqs)).toEqual([faqs[1]]);
    expect(rankFaqs('Chính sách bảo hành của shop', faqs)).toEqual([faqs[1], faqs[0]]);
    expect(rankFaqs('return policy', faqs)).toEqual([faqs[2]]);
    expect(rankFaqs('màu đỏ', faqs)).toEqual(faqs);
  });
  it('accepts Vietnamese and English spoken quantities', () => {
    expect(spokenNumber('hai mươi lăm')).toBe(25);
    expect(spokenNumber('twenty five')).toBe(25);
    expect(spokenNumber('một trăm linh hai')).toBe(102);
    expect(spokenNumber('many')).toBeUndefined();
  });
});
