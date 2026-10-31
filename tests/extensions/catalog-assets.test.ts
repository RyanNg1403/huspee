import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { API, DATABASE_URL } from '../helpers/env.js';
import { db, sessionClient } from '../helpers/fixtures.js';
import manifest from '../../apps/api/prisma/generated-images/manifest.json' with { type: 'json' };

const assetDir = new URL('../../apps/api/prisma/generated-images/', import.meta.url);
const client = sessionClient();

describe('generated catalog', () => {
  it('serves generated WebP media for every fixture with bounded file sizes', async () => {
    const all = await client.marketplace.searchProducts({ page_size: 100 });
    const fixtures = all.data.filter((item) => item.item_id >= 2000101 && item.item_id <= 2000420);
    expect(fixtures).toHaveLength(80);
    expect(new Set(manifest.assets.map((asset) => asset.file)).size).toBe(126);
    for (const shopId of [880001, 880002, 880003, 880004]) {
      const products = fixtures.filter((item) => item.shop.shop_id === shopId);
      expect(products).toHaveLength(20);
      expect(new Set(manifest.assets.filter((asset) => asset.kind === 'product' && asset.shop_id === shopId).map((asset) => asset.item_id)).size).toBe(20);
      const shop = await client.marketplace.getShop(shopId);
      expect(shop.logo_url).toContain('/media/generated-shop-');
    }
    for (const asset of manifest.assets) {
      const file = new URL(asset.file, assetDir);
      expect(statSync(file).size).toBeLessThanOrEqual(asset.kind === 'product' ? 200000 : 75000);
      const bytes = readFileSync(file);
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    }
    for (const item of fixtures) {
      const product = await client.marketplace.getProduct(item.item_id);
      const expected = manifest.assets.filter((asset) => asset.kind === 'product' && asset.item_id === item.item_id);
      expect(product.images).toHaveLength(expected.length);
      for (const tier of product.tier_variations.filter((tier) => /màu/i.test(tier.name))) {
        for (const option of tier.options) {
          expect(option.image_url).toBeTruthy();
          expect(product.images).toContain(option.image_url);
        }
      }
      for (const image of product.images) {
        const response = await fetch(image);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('image/webp');
        expect((await response.arrayBuffer()).byteLength).toBeLessThanOrEqual(200000);
      }
    }
  });

  it('adds missing fixtures idempotently and preserves commerce, seller edits and uploaded media', async () => {
    const pool = db();
    const itemId = 2000320;
    const modelId = 3102130;
    const original = (await pool.query('SELECT original_price, stock FROM models WHERE id = $1', [modelId])).rows[0];
    const originalImages = (await pool.query('SELECT image_id, url, sort_order FROM item_images WHERE item_id = $1 ORDER BY sort_order', [itemId])).rows;
    const originalLogo = (await pool.query('SELECT logo_url FROM shops WHERE id = 880004')).rows[0].logo_url;
    const snapshot = async () => (await pool.query(`SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM web_sessions) AS sessions,
      (SELECT count(*) FROM orders) AS orders,
      (SELECT count(*) FROM cart_items) AS cart,
      (SELECT count(*) FROM assistant_configs) AS assistant`)).rows[0];
    const before = await snapshot();
    try {
      await pool.query('UPDATE models SET original_price = 177000, stock = 7 WHERE id = $1', [modelId]);
      await pool.query('DELETE FROM item_images WHERE item_id = $1', [itemId]);
      await pool.query("INSERT INTO item_images (item_id, image_id, url, sort_order) VALUES ($1, 'seller-upload-preserved', '/media/seller-upload-preserved', 0)", [itemId]);
      await pool.query("UPDATE shops SET logo_url = '/media/seller-logo-preserved' WHERE id = 880004");
      await pool.query('DELETE FROM items WHERE id = 2000420');
      const run = () => {
        const result = spawnSync('pnpm', ['db:catalog:sync'], {
          cwd: fileURLToPath(new URL('../../', import.meta.url)),
          env: { ...process.env, DATABASE_URL, PUBLIC_BASE_URL: API },
          encoding: 'utf8', timeout: 30000,
        });
        if (result.status !== 0) throw new Error(result.stderr || result.stdout);
        return result.stdout;
      };
      expect(run()).toContain('"added":1');
      expect(run()).toContain('"added":0');
      expect(await snapshot()).toEqual(before);
      expect((await pool.query('SELECT original_price, stock FROM models WHERE id = $1', [modelId])).rows[0]).toEqual({ original_price: '177000.00', stock: 7 });
      expect((await pool.query('SELECT image_id FROM item_images WHERE item_id = $1', [itemId])).rows).toEqual([{ image_id: 'seller-upload-preserved' }]);
      expect((await pool.query('SELECT logo_url FROM shops WHERE id = 880004')).rows[0].logo_url).toBe('/media/seller-logo-preserved');
      const restored = await client.marketplace.getProduct(2000420);
      expect(restored.shop.shop_id).toBe(880004);
      expect(restored.images[0]!).toContain('/media/generated-2000420-');
    } finally {
      await pool.query('UPDATE models SET original_price = $1, stock = $2 WHERE id = $3', [original.original_price, original.stock, modelId]);
      await pool.query('DELETE FROM item_images WHERE item_id = $1', [itemId]);
      for (const image of originalImages)
        await pool.query('INSERT INTO item_images (item_id, image_id, url, sort_order) VALUES ($1, $2, $3, $4)', [itemId, image.image_id, image.url, image.sort_order]);
      await pool.query('UPDATE shops SET logo_url = $1 WHERE id = 880004', [originalLogo]);
    }
  }, 90000);
});
