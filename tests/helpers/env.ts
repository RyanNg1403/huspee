/** Shared constants for the test server started by setup/global-setup.ts. */
export const TEST_PORT = Number(process.env.TEST_API_PORT ?? 3999);
export const API = `http://localhost:${TEST_PORT}`;
export const API_V2 = `${API}/api/v2`;
export const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://huspee:huspee@localhost:5432/huspee_test?schema=public';

/** Test fixture Partner identity (CI secret in real deployments; never shipped to browsers). */
export const PARTNER_ID = 2001001;
export const PARTNER_KEY = process.env.TEST_PARTNER_KEY ?? 'test-partner-key-0123456789abcdef0123456789abcdef';
export const TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

/** A redirect on a registered domain; tests read the Location header and never follow it. */
export const PARTNER_REDIRECT = 'http://localhost:9/huspee-test-callback';

export const DEMO_PASSWORD = 'Password123!';
export const SEED = {
  buyers: {
    an: { id: 1, email: 'an.nguyen@example.com' },
    binh: { id: 2, email: 'binh.tran@example.com' },
    cuong: { id: 3, email: 'cuong.le@example.com' },
  },
  sellers: {
    techzone: { email: 'huy.techzone@example.com', shopId: 880001 },
    glowup: { email: 'lan.glowup@example.com', shopId: 880002 },
    saigonStyle: { email: 'tuan.saigonstyle@example.com', shopId: 880003 },
    nhaXinh: { email: 'trang.nhaxinh@example.com', shopId: 880004 },
  },
  items: {
    iphone: { itemId: 2000101, blackModel: 3000101, blueOutOfStock: 3000103 },
    galaxy: { itemId: 2000102 },
    buds: { itemId: 2000103, modelId: 3000121 },
    anker: { itemId: 2000104, modelId: 3000131 },
    mouse: { itemId: 2000106, blackModel: 3000151 },
    effaclar: { itemId: 2000201, small: 3000201 },
    cocoon: { itemId: 2000202, modelId: 3000211 },
    serum: { itemId: 2000203, modelId: 3000221 },
    tee: { itemId: 2000301, whiteM: 3000301, blackM: 3000304 },
    pan: { itemId: 2000402, small: 3000411 },
  },
};
