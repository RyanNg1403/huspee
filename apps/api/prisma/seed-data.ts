/**
 * Deterministic Phase 1 demo fixtures (Vietnamese marketplace, VND prices).
 * IDs and timestamps are fixed so every reset reproduces the same demonstration state.
 */

import { EXPANDED_ITEMS } from './seed-expanded';

export const SEED_BASE_TIME = new Date('2026-10-01T02:00:00.000Z');
export const DEMO_PASSWORD = 'Password123!';

export const LOGISTICS_CHANNELS = [
  { id: 50011, name: 'SPX Express', description: 'Giao hàng tiêu chuẩn SPX', baseFee: 16500, perKgFee: 5000, minDays: 2, maxDays: 4, codEnabled: true, trackingPrefix: 'SPXVN' },
  { id: 50012, name: 'Giao Hàng Nhanh', description: 'GHN - giao nhanh nội thành', baseFee: 18000, perKgFee: 5000, minDays: 2, maxDays: 3, codEnabled: true, trackingPrefix: 'GHN' },
  { id: 50018, name: 'Giao Hàng Tiết Kiệm', description: 'GHTK - tiết kiệm', baseFee: 15000, perKgFee: 4000, minDays: 3, maxDays: 5, codEnabled: true, trackingPrefix: 'GHTK' },
  { id: 50021, name: 'J&T Express', description: 'J&T Express Việt Nam', baseFee: 17000, perKgFee: 4500, minDays: 2, maxDays: 4, codEnabled: true, trackingPrefix: 'JTVN' },
  { id: 50066, name: 'Hỏa Tốc - Ninja Van', description: 'Giao hỏa tốc trong ngày (không hỗ trợ COD)', baseFee: 35000, perKgFee: 8000, minDays: 1, maxDays: 1, codEnabled: false, trackingPrefix: 'NJVHT' },
];

export const CATEGORIES = [
  { id: 100001, parentId: null, name: 'Phones & Accessories', displayName: 'Điện Thoại & Phụ Kiện', sortOrder: 1 },
  { id: 100010, parentId: 100001, name: 'Mobile Phones', displayName: 'Điện thoại', sortOrder: 1 },
  { id: 100011, parentId: 100001, name: 'Headphones', displayName: 'Tai nghe', sortOrder: 2 },
  { id: 100012, parentId: 100001, name: 'Chargers & Cables', displayName: 'Sạc & Cáp', sortOrder: 3 },
  { id: 100002, parentId: null, name: 'Computers & Laptops', displayName: 'Máy Tính & Laptop', sortOrder: 2 },
  { id: 100020, parentId: 100002, name: 'Laptops', displayName: 'Laptop', sortOrder: 1 },
  { id: 100021, parentId: 100002, name: 'Mice & Keyboards', displayName: 'Chuột & Bàn phím', sortOrder: 2 },
  { id: 100003, parentId: null, name: 'Beauty', displayName: 'Sắc Đẹp', sortOrder: 3 },
  { id: 100030, parentId: 100003, name: 'Skincare', displayName: 'Chăm sóc da mặt', sortOrder: 1 },
  { id: 100031, parentId: 100003, name: 'Makeup', displayName: 'Trang điểm', sortOrder: 2 },
  { id: 100004, parentId: null, name: "Men's Fashion", displayName: 'Thời Trang Nam', sortOrder: 4 },
  { id: 100040, parentId: 100004, name: 'T-Shirts', displayName: 'Áo thun', sortOrder: 1 },
  { id: 100041, parentId: 100004, name: 'Jeans', displayName: 'Quần jeans', sortOrder: 2 },
  { id: 100042, parentId: 100004, name: 'Shirts', displayName: 'Áo sơ mi', sortOrder: 3 },
  { id: 100043, parentId: 100004, name: 'Bags', displayName: 'Túi & phụ kiện', sortOrder: 4 },
  { id: 100005, parentId: null, name: "Women's Fashion", displayName: 'Thời Trang Nữ', sortOrder: 5 },
  { id: 100050, parentId: 100005, name: 'Dresses', displayName: 'Đầm', sortOrder: 1 },
  { id: 100051, parentId: 100005, name: 'Cardigans', displayName: 'Áo khoác cardigan', sortOrder: 2 },
  { id: 100006, parentId: null, name: 'Home & Living', displayName: 'Nhà Cửa & Đời Sống', sortOrder: 6 },
  { id: 100060, parentId: 100006, name: 'Kitchenware', displayName: 'Dụng cụ nhà bếp', sortOrder: 1 },
  { id: 100061, parentId: 100006, name: 'Drinkware', displayName: 'Bình & ly uống nước', sortOrder: 2 },
  { id: 100062, parentId: 100006, name: 'Home Textiles', displayName: 'Đồ vải gia đình', sortOrder: 3 },
  { id: 100063, parentId: 100006, name: 'Lighting', displayName: 'Đèn trang trí', sortOrder: 4 },
  {"id":100013,"parentId":100001,"name":"Speakers","displayName":"Loa","sortOrder":4},
  {"id":100014,"parentId":100001,"name":"Wearables","displayName":"Thiết bị đeo","sortOrder":5},
  {"id":100022,"parentId":100002,"name":"Computer Accessories","displayName":"Phụ kiện máy tính","sortOrder":3},
  {"id":100023,"parentId":100002,"name":"Storage","displayName":"Thiết bị lưu trữ","sortOrder":4},
  {"id":100024,"parentId":100002,"name":"Tablets","displayName":"Máy tính bảng","sortOrder":5},
  {"id":100032,"parentId":100003,"name":"Body Care","displayName":"Chăm sóc cơ thể","sortOrder":3},
  {"id":100033,"parentId":100003,"name":"Hair Care","displayName":"Chăm sóc tóc","sortOrder":4},
  {"id":100034,"parentId":100003,"name":"Beauty Tools","displayName":"Dụng cụ làm đẹp","sortOrder":5},
  {"id":100044,"parentId":100004,"name":"Trousers & Shorts","displayName":"Quần dài & quần short","sortOrder":5},
  {"id":100045,"parentId":100004,"name":"Outerwear","displayName":"Áo khoác","sortOrder":6},
  {"id":100046,"parentId":100004,"name":"Accessories","displayName":"Phụ kiện thời trang","sortOrder":7},
  {"id":100052,"parentId":100005,"name":"Tops","displayName":"Áo nữ","sortOrder":3},
  {"id":100053,"parentId":100005,"name":"Bottoms","displayName":"Quần & chân váy","sortOrder":4},
  {"id":100064,"parentId":100006,"name":"Storage & Organization","displayName":"Lưu trữ & sắp xếp","sortOrder":5},
  {"id":100065,"parentId":100006,"name":"Home Decor","displayName":"Trang trí nhà cửa","sortOrder":6},
] as const;

const v = (value_id: number, name: string, display_name = name) => ({ value_id, name, display_name });

export const ATTRIBUTES = [
  { id: 200101, categoryId: 100010, name: 'Storage Capacity', displayName: 'Dung lượng lưu trữ', isMandatory: true, values: [v(1, '128GB'), v(2, '256GB'), v(3, '512GB')] },
  { id: 200102, categoryId: 100010, name: 'Warranty Type', displayName: 'Loại bảo hành', isMandatory: false, values: [v(1, 'Manufacturer', 'Bảo hành chính hãng'), v(2, 'Shop', 'Bảo hành shop')] },
  { id: 200103, categoryId: 100010, name: 'RAM', displayName: 'RAM', isMandatory: false, values: [v(1, '6GB'), v(2, '8GB')] },
  { id: 200104, categoryId: 100010, name: 'Main Camera', displayName: 'Camera chính', isMandatory: false, values: [v(1, '48MP'), v(2, '50MP OIS')] },
  { id: 200105, categoryId: 100010, name: 'Display', displayName: 'Màn hình', isMandatory: false, values: [v(1, 'Super AMOLED 120Hz'), v(2, 'Super Retina XDR 60Hz')] },
  { id: 200106, categoryId: 100010, name: 'Battery Capacity', displayName: 'Dung lượng pin', isMandatory: false, values: [v(1, '5000mAh')] },
  { id: 200107, categoryId: 100010, name: 'Water Resistance', displayName: 'Kháng nước', isMandatory: false, values: [v(1, 'IP67'), v(2, 'IP68')] },
  { id: 200108, categoryId: 100010, name: 'Charging Port', displayName: 'Cổng sạc', isMandatory: false, values: [v(1, 'USB-C')] },
  { id: 200111, categoryId: 100011, name: 'Connectivity', displayName: 'Kết nối', isMandatory: true, values: [v(1, 'Bluetooth'), v(2, 'Wired', 'Có dây')] },
  { id: 200121, categoryId: 100012, name: 'Output Power', displayName: 'Công suất', isMandatory: false, values: [v(1, '20W'), v(2, '65W'), v(3, '100W')] },
  { id: 200201, categoryId: 100020, name: 'RAM', displayName: 'RAM', isMandatory: true, values: [v(1, '8GB'), v(2, '16GB'), v(3, '32GB')] },
  { id: 200202, categoryId: 100020, name: 'Processor', displayName: 'Bộ vi xử lý', isMandatory: true, values: [v(1, 'Intel Core i5'), v(2, 'Intel Core i7'), v(3, 'AMD Ryzen 7')] },
  { id: 200211, categoryId: 100021, name: 'Connectivity', displayName: 'Kết nối', isMandatory: false, values: [v(1, 'Wireless', 'Không dây'), v(2, 'Wired', 'Có dây')] },
  { id: 200301, categoryId: 100030, name: 'Skin Type', displayName: 'Loại da', isMandatory: true, values: [v(1, 'All', 'Mọi loại da'), v(2, 'Oily', 'Da dầu'), v(3, 'Dry', 'Da khô'), v(4, 'Sensitive', 'Da nhạy cảm')] },
  { id: 200302, categoryId: 100030, name: 'Country of Origin', displayName: 'Xuất xứ', isMandatory: false, values: [v(1, 'Vietnam', 'Việt Nam'), v(2, 'France', 'Pháp'), v(3, 'Korea', 'Hàn Quốc')] },
  { id: 200311, categoryId: 100031, name: 'Finish', displayName: 'Hiệu ứng', isMandatory: false, values: [v(1, 'Matte', 'Lì'), v(2, 'Glossy', 'Bóng')] },
  { id: 200401, categoryId: 100040, name: 'Material', displayName: 'Chất liệu', isMandatory: true, values: [v(1, 'Cotton'), v(2, 'Polyester'), v(3, 'Linen', 'Vải lanh')] },
  { id: 200411, categoryId: 100041, name: 'Material', displayName: 'Chất liệu', isMandatory: true, values: [v(1, 'Denim')] },
  { id: 200421, categoryId: 100042, name: 'Material', displayName: 'Chất liệu', isMandatory: true, values: [v(1, 'Linen', 'Vải lanh'), v(2, 'Cotton')] },
  { id: 200431, categoryId: 100043, name: 'Material', displayName: 'Chất liệu', isMandatory: true, values: [v(1, 'Canvas', 'Vải canvas')] },
  { id: 200501, categoryId: 100050, name: 'Material', displayName: 'Chất liệu', isMandatory: true, values: [v(1, 'Silk', 'Lụa'), v(2, 'Linen', 'Vải lanh'), v(3, 'Chiffon', 'Voan')] },
  { id: 200511, categoryId: 100051, name: 'Material', displayName: 'Chất liệu', isMandatory: true, values: [v(1, 'Cotton knit', 'Cotton dệt kim')] },
  { id: 200601, categoryId: 100060, name: 'Material', displayName: 'Chất liệu', isMandatory: false, values: [v(1, 'Stainless Steel', 'Thép không gỉ'), v(2, 'Glass', 'Thủy tinh'), v(3, 'Plastic', 'Nhựa'), v(4, 'Ceramic', 'Gốm sứ')] },
  { id: 200611, categoryId: 100061, name: 'Material', displayName: 'Chất liệu', isMandatory: true, values: [v(1, 'Stainless Steel', 'Thép không gỉ'), v(2, 'Glass', 'Thủy tinh')] },
  { id: 200621, categoryId: 100062, name: 'Material', displayName: 'Chất liệu', isMandatory: true, values: [v(1, 'Cotton')] },
  { id: 200631, categoryId: 100063, name: 'Light Source', displayName: 'Nguồn sáng', isMandatory: true, values: [v(1, 'LED')] },
];

export const BRANDS = [
  { id: 3001, name: 'Apple', categoryId: 100001 },
  { id: 3002, name: 'Samsung', categoryId: 100001 },
  { id: 3003, name: 'Xiaomi', categoryId: 100001 },
  { id: 3004, name: 'Anker', categoryId: 100012 },
  { id: 3005, name: 'Logitech', categoryId: 100021 },
  { id: 3006, name: 'ASUS', categoryId: 100020 },
  { id: 3007, name: 'La Roche-Posay', categoryId: 100003 },
  { id: 3008, name: 'Cocoon', categoryId: 100003 },
  { id: 3009, name: 'Innisfree', categoryId: 100003 },
  { id: 3010, name: 'Maybelline', categoryId: 100031 },
  { id: 3011, name: 'Coolmate', categoryId: 100004 },
  { id: 3012, name: 'Routine', categoryId: 100004 },
  { id: 3013, name: 'Lock&Lock', categoryId: 100006 },
  { id: 3014, name: 'Sunhouse', categoryId: 100006 },
];

export const BUYERS = [
  { id: 1, email: 'an.nguyen@example.com', name: 'Nguyễn Văn An', phone: '0901234567' },
  { id: 2, email: 'binh.tran@example.com', name: 'Trần Thị Bình', phone: '0912345678' },
  { id: 3, email: 'cuong.le@example.com', name: 'Lê Minh Cường', phone: '0987654321' },
];

export const BUYER_ADDRESSES = [
  { id: 1, userId: 1, name: 'Nguyễn Văn An', phone: '0901234567', state: 'TP. Hồ Chí Minh', city: 'TP. Hồ Chí Minh', district: 'Quận 1', town: 'Phường Bến Nghé', address: '12 Nguyễn Huệ', zipcode: '700000', isDefault: true },
  { id: 2, userId: 1, name: 'Nguyễn Văn An (Công ty)', phone: '0901234567', state: 'TP. Hồ Chí Minh', city: 'TP. Hồ Chí Minh', district: 'Quận 7', town: 'Phường Tân Phú', address: '101 Tôn Dật Tiên', zipcode: '700000', isDefault: false },
  { id: 3, userId: 2, name: 'Trần Thị Bình', phone: '0912345678', state: 'Hà Nội', city: 'Hà Nội', district: 'Quận Cầu Giấy', town: 'Phường Dịch Vọng', address: '88 Xuân Thủy', zipcode: '100000', isDefault: true },
  { id: 4, userId: 3, name: 'Lê Minh Cường', phone: '0987654321', state: 'Đà Nẵng', city: 'Đà Nẵng', district: 'Quận Hải Châu', town: 'Phường Thạch Thang', address: '25 Bạch Đằng', zipcode: '550000', isDefault: true },
];

export const SELLERS = [
  { id: 101, email: 'huy.techzone@example.com', name: 'Phạm Quốc Huy', phone: '0933111222' },
  { id: 102, email: 'lan.glowup@example.com', name: 'Võ Thị Lan', phone: '0933222333' },
  { id: 103, email: 'tuan.saigonstyle@example.com', name: 'Đặng Minh Tuấn', phone: '0933333444' },
  { id: 104, email: 'trang.nhaxinh@example.com', name: 'Hoàng Thu Trang', phone: '0933444555' },
];

export const SHOPS = [
  {
    id: 880001,
    ownerId: 101,
    name: 'TechZone Official',
    description: 'Chuyên điện thoại, laptop và phụ kiện chính hãng. Bảo hành 12 tháng, đổi trả trong 7 ngày.',
    city: 'Hà Nội',
    isOfficial: true,
    color: '#1e88e5',
    policy: {
      shippingPolicy: 'Đóng gói chống sốc, giao trong 24h làm việc. Miễn phí vận chuyển cho đơn từ 500.000₫.',
      returnPolicy: 'Đổi trả trong 7 ngày nếu sản phẩm lỗi do nhà sản xuất. Sản phẩm phải còn nguyên tem, hộp và phụ kiện.',
      warrantyPolicy: 'Bảo hành chính hãng 12 tháng tại trung tâm bảo hành ủy quyền.',
      returnWindowDays: 7,
      freeShippingMinSpend: 500000,
    },
    address: { name: 'Kho TechZone', phone: '0933111222', state: 'Hà Nội', city: 'Hà Nội', district: 'Quận Đống Đa', town: 'Phường Láng Hạ', address: '45 Láng Hạ', zipcode: '100000' },
  },
  {
    id: 880002,
    ownerId: 102,
    name: 'GlowUp Beauty',
    description: 'Mỹ phẩm chính hãng Việt Nam, Pháp, Hàn Quốc. Tư vấn chăm sóc da miễn phí.',
    city: 'TP. Hồ Chí Minh',
    isOfficial: false,
    color: '#ec407a',
    policy: {
      shippingPolicy: 'Giao hàng toàn quốc 2-4 ngày. Miễn phí vận chuyển cho đơn từ 299.000₫.',
      returnPolicy: 'Hỗ trợ đổi trả trong 7 ngày nếu sản phẩm bị lỗi, hư hỏng khi vận chuyển hoặc giao sai.',
      warrantyPolicy: 'Cam kết hàng chính hãng, hoàn tiền 200% nếu phát hiện hàng giả.',
      returnWindowDays: 7,
      freeShippingMinSpend: 299000,
    },
    address: { name: 'GlowUp Beauty', phone: '0933222333', state: 'TP. Hồ Chí Minh', city: 'TP. Hồ Chí Minh', district: 'Quận 3', town: 'Phường Võ Thị Sáu', address: '210 Nam Kỳ Khởi Nghĩa', zipcode: '700000' },
  },
  {
    id: 880003,
    ownerId: 103,
    name: 'Saigon Style',
    description: 'Thời trang nam nữ thiết kế tại Sài Gòn. Chất liệu thoáng mát, phù hợp khí hậu nhiệt đới.',
    city: 'TP. Hồ Chí Minh',
    isOfficial: false,
    color: '#43a047',
    policy: {
      shippingPolicy: 'Gửi hàng trong 1-2 ngày. Miễn phí vận chuyển cho đơn từ 399.000₫.',
      returnPolicy: 'Đổi size/đổi mẫu trong 15 ngày, sản phẩm chưa qua sử dụng và còn tag.',
      warrantyPolicy: 'Không áp dụng bảo hành cho sản phẩm thời trang.',
      returnWindowDays: 15,
      freeShippingMinSpend: 399000,
    },
    address: { name: 'Xưởng Saigon Style', phone: '0933333444', state: 'TP. Hồ Chí Minh', city: 'TP. Hồ Chí Minh', district: 'Quận Tân Bình', town: 'Phường 4', address: '18 Cộng Hòa', zipcode: '700000' },
  },
  {
    id: 880004,
    ownerId: 104,
    name: 'Nhà Xinh Home',
    description: 'Đồ gia dụng, dụng cụ nhà bếp bền đẹp cho gia đình Việt.',
    city: 'Đà Nẵng',
    isOfficial: false,
    color: '#fb8c00',
    policy: {
      shippingPolicy: 'Hàng cồng kềnh có thể giao 3-5 ngày. Phí vận chuyển tính theo khối lượng.',
      returnPolicy: 'Đổi trả trong 7 ngày nếu sản phẩm nứt vỡ, móp méo khi nhận hàng (cần video mở hộp).',
      warrantyPolicy: 'Bảo hành 6 tháng đối với thiết bị điện.',
      returnWindowDays: 7,
      freeShippingMinSpend: null,
    },
    address: { name: 'Kho Nhà Xinh', phone: '0933444555', state: 'Đà Nẵng', city: 'Đà Nẵng', district: 'Quận Thanh Khê', town: 'Phường Thạc Gián', address: '72 Điện Biên Phủ', zipcode: '550000' },
  },
];

export interface SeedModel {
  id: number;
  tierIndex: number[];
  sku: string;
  price: number;
  stock: number;
  promo?: number;
}

export interface SeedItem {
  id: number;
  shopId: number;
  categoryId: number;
  brandId: number | null;
  name: string;
  short: string;
  description: string;
  sku: string;
  weightKg: number;
  sales: number;
  views: number;
  likes: number;
  attributes: Array<{ attribute_id: number; attribute_value_list: Array<{ value_id: number }> }>;
  tiers?: Array<{ name: string; options: string[] }>;
  /** Items without tiers have a single default model. */
  models: SeedModel[];
  collections?: string[];
}

const attr = (attribute_id: number, value_id: number) => ({ attribute_id, attribute_value_list: [{ value_id }] });

export const ITEMS: SeedItem[] = [
  // ----- TechZone Official -----
  {
    id: 2000101, shopId: 880001, categoryId: 100010, brandId: 3001, name: 'Apple iPhone 15 128GB Chính Hãng VN/A', short: 'iPhone 15',
    description: 'iPhone 15 với Dynamic Island, camera chính 48MP và cổng USB‑C. Hàng chính hãng VN/A, nguyên seal.', sku: 'TZ-IP15',
    weightKg: 0.4, sales: 312, views: 15800, likes: 920, attributes: [attr(200101, 1), attr(200102, 1), attr(200104, 1), attr(200108, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Đen', 'Hồng', 'Xanh dương'] }],
    models: [
      { id: 3000101, tierIndex: [0], sku: 'TZ-IP15-BLK', price: 19990000, stock: 25, promo: 18490000 },
      { id: 3000102, tierIndex: [1], sku: 'TZ-IP15-PNK', price: 19990000, stock: 12, promo: 18490000 },
      { id: 3000103, tierIndex: [2], sku: 'TZ-IP15-BLU', price: 19990000, stock: 0 },
    ],
    collections: ['Điện thoại hot'],
  },
  {
    id: 2000102, shopId: 880001, categoryId: 100010, brandId: 3002, name: 'Samsung Galaxy A55 5G 8GB/128GB', short: 'Galaxy A55',
    description: 'Màn hình Super AMOLED 120Hz, camera 50MP OIS, kháng nước IP67, pin 5000mAh.', sku: 'TZ-A55',
    weightKg: 0.45, sales: 205, views: 9100, likes: 410, attributes: [attr(200101, 1), attr(200102, 1), attr(200103, 2), attr(200104, 2), attr(200105, 1), attr(200106, 1), attr(200107, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Xanh Navy', 'Tím Lilac'] }, { name: 'Dung lượng', options: ['128GB', '256GB'] }],
    models: [
      { id: 3000111, tierIndex: [0, 0], sku: 'TZ-A55-NV-128', price: 9490000, stock: 30 },
      { id: 3000112, tierIndex: [0, 1], sku: 'TZ-A55-NV-256', price: 10490000, stock: 18 },
      { id: 3000113, tierIndex: [1, 0], sku: 'TZ-A55-LL-128', price: 9490000, stock: 22 },
      { id: 3000114, tierIndex: [1, 1], sku: 'TZ-A55-LL-256', price: 10490000, stock: 3 },
    ],
    collections: ['Điện thoại hot'],
  },
  {
    id: 2000103, shopId: 880001, categoryId: 100011, brandId: 3003, name: 'Tai nghe Bluetooth Xiaomi Redmi Buds 5', short: 'Redmi Buds 5',
    description: 'Chống ồn chủ động 46dB, thời lượng pin 40 giờ, kết nối Bluetooth 5.3 ổn định.', sku: 'TZ-RB5',
    weightKg: 0.15, sales: 1240, views: 22000, likes: 1800, attributes: [attr(200111, 1)],
    models: [{ id: 3000121, tierIndex: [], sku: 'TZ-RB5', price: 990000, stock: 150, promo: 790000 }],
    collections: ['Phụ kiện bán chạy'],
  },
  {
    id: 2000104, shopId: 880001, categoryId: 100012, brandId: 3004, name: 'Củ sạc nhanh Anker 65W GaN 3 cổng', short: 'Anker 65W',
    description: 'Sạc nhanh laptop, điện thoại cùng lúc. Công nghệ GaN II nhỏ gọn, an toàn.', sku: 'TZ-ANK65',
    weightKg: 0.2, sales: 860, views: 12000, likes: 640, attributes: [attr(200121, 2)],
    models: [{ id: 3000131, tierIndex: [], sku: 'TZ-ANK65', price: 890000, stock: 80 }],
    collections: ['Phụ kiện bán chạy'],
  },
  {
    id: 2000105, shopId: 880001, categoryId: 100020, brandId: 3006, name: 'Laptop ASUS Vivobook 15 OLED i5 16GB 512GB', short: 'Vivobook 15',
    description: 'Màn hình OLED 15.6" FHD, Intel Core i5 thế hệ 13, RAM 16GB, SSD 512GB, nặng 1.7kg.', sku: 'TZ-VB15',
    weightKg: 2.3, sales: 64, views: 5400, likes: 230, attributes: [attr(200201, 2), attr(200202, 1)],
    models: [{ id: 3000141, tierIndex: [], sku: 'TZ-VB15', price: 16490000, stock: 9 }],
  },
  {
    id: 2000106, shopId: 880001, categoryId: 100021, brandId: 3005, name: 'Chuột không dây Logitech M331 Silent Plus', short: 'Logitech M331',
    description: 'Giảm 90% tiếng ồn khi click, pin 24 tháng, kết nối USB receiver 2.4GHz.', sku: 'TZ-M331',
    weightKg: 0.12, sales: 2100, views: 18000, likes: 1500, attributes: [attr(200211, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Đen', 'Đỏ', 'Xanh'] }],
    models: [
      { id: 3000151, tierIndex: [0], sku: 'TZ-M331-BLK', price: 349000, stock: 200 },
      { id: 3000152, tierIndex: [1], sku: 'TZ-M331-RED', price: 349000, stock: 45 },
      { id: 3000153, tierIndex: [2], sku: 'TZ-M331-BLU', price: 349000, stock: 4 },
    ],
  },
  // ----- GlowUp Beauty -----
  {
    id: 2000201, shopId: 880002, categoryId: 100030, brandId: 3007, name: 'Sữa rửa mặt La Roche-Posay Effaclar Gel 400ml', short: 'Effaclar Gel',
    description: 'Gel rửa mặt tạo bọt cho da dầu mụn, làm sạch sâu mà không gây khô căng.', sku: 'GU-LRP-EFF',
    weightKg: 0.45, sales: 3400, views: 41000, likes: 5200, attributes: [attr(200301, 2), attr(200302, 2)],
    tiers: [{ name: 'Dung tích', options: ['200ml', '400ml'] }],
    models: [
      { id: 3000201, tierIndex: [0], sku: 'GU-LRP-EFF-200', price: 365000, stock: 120, promo: 329000 },
      { id: 3000202, tierIndex: [1], sku: 'GU-LRP-EFF-400', price: 545000, stock: 60, promo: 479000 },
    ],
    collections: ['Chăm sóc da'],
  },
  {
    id: 2000202, shopId: 880002, categoryId: 100030, brandId: 3008, name: 'Nước bí đao Cocoon cân bằng da 310ml', short: 'Cocoon Bí Đao',
    description: 'Toner thuần chay từ bí đao giúp giảm dầu thừa, làm dịu da mụn. Mỹ phẩm Việt Nam.', sku: 'GU-CC-BD',
    weightKg: 0.35, sales: 5100, views: 52000, likes: 7400, attributes: [attr(200301, 2), attr(200302, 1)],
    models: [{ id: 3000211, tierIndex: [], sku: 'GU-CC-BD', price: 245000, stock: 300 }],
    collections: ['Chăm sóc da', 'Mỹ phẩm Việt'],
  },
  {
    id: 2000203, shopId: 880002, categoryId: 100030, brandId: 3009, name: 'Serum Innisfree Green Tea Seed 80ml', short: 'Serum Trà Xanh',
    description: 'Serum dưỡng ẩm chiết xuất trà xanh Jeju, cấp nước tức thì cho da căng mướt.', sku: 'GU-INF-GT',
    weightKg: 0.25, sales: 1800, views: 26000, likes: 2900, attributes: [attr(200301, 1), attr(200302, 3)],
    models: [{ id: 3000221, tierIndex: [], sku: 'GU-INF-GT', price: 650000, stock: 75 }],
    collections: ['Chăm sóc da'],
  },
  {
    id: 2000204, shopId: 880002, categoryId: 100031, brandId: 3010, name: 'Son kem lì Maybelline SuperStay Matte Ink', short: 'Son Maybelline',
    description: 'Son kem lì lâu trôi đến 16 giờ, chất son mịn nhẹ, không lem.', sku: 'GU-MB-SS',
    weightKg: 0.05, sales: 4200, views: 38000, likes: 6100, attributes: [attr(200311, 1)],
    tiers: [{ name: 'Màu son', options: ['115 Founder', '118 Dancer', '210 Versatile', '220 Ambitious'] }],
    models: [
      { id: 3000231, tierIndex: [0], sku: 'GU-MB-115', price: 259000, stock: 80 },
      { id: 3000232, tierIndex: [1], sku: 'GU-MB-118', price: 259000, stock: 64 },
      { id: 3000233, tierIndex: [2], sku: 'GU-MB-210', price: 259000, stock: 0 },
      { id: 3000234, tierIndex: [3], sku: 'GU-MB-220', price: 259000, stock: 33 },
    ],
  },
  {
    id: 2000205, shopId: 880002, categoryId: 100030, brandId: null, name: 'Kem chống nắng GlowUp Daily SPF50+ PA++++', short: 'GlowUp Daily SPF50+',
    description: 'Kem chống nắng dùng hằng ngày, kết cấu nhẹ, lớp nền tự nhiên. Thoa lại sau khi lau mặt hoặc tiếp xúc với nước; có hai dung tích để lựa chọn.', sku: 'GU-SUN-DAILY',
    weightKg: 0.12, sales: 680, views: 7400, likes: 530, attributes: [attr(200301, 1), attr(200302, 1)],
    tiers: [{ name: 'Dung tích', options: ['50ml', '80ml'] }],
    models: [
      { id: 3000241, tierIndex: [0], sku: 'GU-SUN-50', price: 219000, stock: 85, promo: 199000 },
      { id: 3000242, tierIndex: [1], sku: 'GU-SUN-80', price: 299000, stock: 25 },
    ],
    collections: ['Chăm sóc da', 'Chăm sóc hằng ngày'],
  },
  {
    id: 2000206, shopId: 880002, categoryId: 100031, brandId: null, name: 'Bộ cọ trang điểm GlowUp Essential 5 món', short: 'Bộ cọ Essential',
    description: 'Bộ 5 cọ gồm cọ phấn phủ, cọ má, cọ nền và hai cọ mắt. Lông cọ sợi tổng hợp mềm, cán gỗ phủ màu kem; kèm túi vải đựng cọ.', sku: 'GU-BRUSH-5',
    weightKg: 0.2, sales: 430, views: 5200, likes: 390, attributes: [],
    models: [{ id: 3000251, tierIndex: [], sku: 'GU-BRUSH-5', price: 159000, stock: 70 }],
    collections: ['Trang điểm mỗi ngày'],
  },
  // ----- Saigon Style -----
  {
    id: 2000301, shopId: 880003, categoryId: 100040, brandId: 3011, name: 'Áo thun nam Cotton Compact Coolmate', short: 'Áo thun Cotton',
    description: 'Vải cotton compact co giãn 4 chiều, thấm hút mồ hôi, form regular dễ mặc.', sku: 'SS-TEE-CC',
    weightKg: 0.25, sales: 6800, views: 70000, likes: 8800, attributes: [attr(200401, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Trắng', 'Đen', 'Xanh rêu'] }, { name: 'Size', options: ['M', 'L', 'XL'] }],
    models: [
      { id: 3000301, tierIndex: [0, 0], sku: 'SS-TEE-W-M', price: 189000, stock: 50, promo: 159000 },
      { id: 3000302, tierIndex: [0, 1], sku: 'SS-TEE-W-L', price: 189000, stock: 50, promo: 159000 },
      { id: 3000303, tierIndex: [0, 2], sku: 'SS-TEE-W-XL', price: 189000, stock: 20, promo: 159000 },
      { id: 3000304, tierIndex: [1, 0], sku: 'SS-TEE-B-M', price: 189000, stock: 60 },
      { id: 3000305, tierIndex: [1, 1], sku: 'SS-TEE-B-L', price: 189000, stock: 45 },
      { id: 3000306, tierIndex: [1, 2], sku: 'SS-TEE-B-XL', price: 189000, stock: 2 },
      { id: 3000307, tierIndex: [2, 0], sku: 'SS-TEE-G-M', price: 199000, stock: 15 },
      { id: 3000308, tierIndex: [2, 1], sku: 'SS-TEE-G-L', price: 199000, stock: 0 },
      { id: 3000309, tierIndex: [2, 2], sku: 'SS-TEE-G-XL', price: 199000, stock: 8 },
    ],
    collections: ['Basic hằng ngày'],
  },
  {
    id: 2000302, shopId: 880003, categoryId: 100041, brandId: 3012, name: 'Quần jeans nam Slim Fit Routine', short: 'Jeans Slim Fit',
    description: 'Denim co giãn nhẹ, wash màu tự nhiên, dáng slim fit tôn dáng.', sku: 'SS-JEAN-SF',
    weightKg: 0.6, sales: 1300, views: 21000, likes: 1700, attributes: [attr(200411, 1)],
    tiers: [{ name: 'Size', options: ['29', '30', '31', '32'] }],
    models: [
      { id: 3000311, tierIndex: [0], sku: 'SS-JEAN-29', price: 549000, stock: 14 },
      { id: 3000312, tierIndex: [1], sku: 'SS-JEAN-30', price: 549000, stock: 25 },
      { id: 3000313, tierIndex: [2], sku: 'SS-JEAN-31', price: 549000, stock: 25 },
      { id: 3000314, tierIndex: [3], sku: 'SS-JEAN-32', price: 549000, stock: 10 },
    ],
  },
  {
    id: 2000303, shopId: 880003, categoryId: 100050, brandId: null, name: 'Đầm lụa hoa nhí dáng xòe Saigon Style', short: 'Đầm lụa hoa',
    description: 'Chất lụa mềm mát, họa tiết hoa nhí nữ tính, phù hợp đi chơi, dạo phố.', sku: 'SS-DRESS-FL',
    weightKg: 0.3, sales: 920, views: 16000, likes: 2400, attributes: [attr(200501, 1)],
    tiers: [{ name: 'Size', options: ['S', 'M', 'L'] }],
    models: [
      { id: 3000321, tierIndex: [0], sku: 'SS-DRESS-S', price: 429000, stock: 18 },
      { id: 3000322, tierIndex: [1], sku: 'SS-DRESS-M', price: 429000, stock: 22 },
      { id: 3000323, tierIndex: [2], sku: 'SS-DRESS-L', price: 429000, stock: 9 },
    ],
    collections: ['Bộ sưu tập Thu'],
  },
  {
    id: 2000304, shopId: 880003, categoryId: 100042, brandId: null, name: 'Áo sơ mi nam linen Saigon Style tay ngắn', short: 'Sơ mi linen',
    description: 'Áo sơ mi cổ mở, tay ngắn, chất linen thoáng nhẹ. Form relaxed, đường may gọn; có màu be và xanh sage.', sku: 'SS-LINEN-SHIRT',
    weightKg: 0.28, sales: 570, views: 8400, likes: 690, attributes: [attr(200421, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Be', 'Xanh sage'] }, { name: 'Size', options: ['M', 'L', 'XL'] }],
    models: [
      { id: 3000331, tierIndex: [0, 0], sku: 'SS-LINEN-BE-M', price: 329000, stock: 28 },
      { id: 3000332, tierIndex: [0, 1], sku: 'SS-LINEN-BE-L', price: 329000, stock: 32 },
      { id: 3000333, tierIndex: [0, 2], sku: 'SS-LINEN-BE-XL', price: 329000, stock: 12 },
      { id: 3000334, tierIndex: [1, 0], sku: 'SS-LINEN-SG-M', price: 329000, stock: 18 },
      { id: 3000335, tierIndex: [1, 1], sku: 'SS-LINEN-SG-L', price: 329000, stock: 16 },
      { id: 3000336, tierIndex: [1, 2], sku: 'SS-LINEN-SG-XL', price: 329000, stock: 0 },
    ],
    collections: ['Basic hằng ngày'],
  },
  {
    id: 2000305, shopId: 880003, categoryId: 100043, brandId: null, name: 'Túi tote canvas Saigon Style có khóa kéo', short: 'Tote canvas',
    description: 'Túi canvas dày có khóa kéo miệng túi, quai đeo vai và một ngăn nhỏ bên trong. Kích thước 36 × 32 × 10cm, phù hợp mang đồ dùng đi học hoặc đi làm.', sku: 'SS-TOTE-CV',
    weightKg: 0.35, sales: 820, views: 9900, likes: 770, attributes: [attr(200431, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Kem', 'Đen'] }],
    models: [
      { id: 3000341, tierIndex: [0], sku: 'SS-TOTE-CREAM', price: 169000, stock: 55 },
      { id: 3000342, tierIndex: [1], sku: 'SS-TOTE-BLACK', price: 169000, stock: 38 },
    ],
    collections: ['Phụ kiện đi phố'],
  },
  {
    id: 2000306, shopId: 880003, categoryId: 100051, brandId: null, name: 'Áo cardigan nữ cotton dệt kim Saigon Style', short: 'Cardigan cotton',
    description: 'Cardigan cổ tròn cài nút, cotton dệt kim mềm nhẹ, phù hợp khoác ngoài khi đi làm. Màu kem và xanh sage; hai size S/M và L/XL.', sku: 'SS-CARDIGAN',
    weightKg: 0.4, sales: 360, views: 6100, likes: 420, attributes: [attr(200511, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Kem', 'Xanh sage'] }, { name: 'Size', options: ['S/M', 'L/XL'] }],
    models: [
      { id: 3000351, tierIndex: [0, 0], sku: 'SS-CARD-CREAM-SM', price: 389000, stock: 22, promo: 349000 },
      { id: 3000352, tierIndex: [0, 1], sku: 'SS-CARD-CREAM-LX', price: 389000, stock: 19 },
      { id: 3000353, tierIndex: [1, 0], sku: 'SS-CARD-SAGE-SM', price: 389000, stock: 15 },
      { id: 3000354, tierIndex: [1, 1], sku: 'SS-CARD-SAGE-LX', price: 389000, stock: 9 },
    ],
    collections: ['Bộ sưu tập Thu'],
  },
  // ----- Nhà Xinh Home -----
  {
    id: 2000401, shopId: 880004, categoryId: 100060, brandId: 3013, name: 'Bộ 3 hộp thủy tinh Lock&Lock chịu nhiệt', short: 'Hộp Lock&Lock',
    description: 'Thủy tinh borosilicate chịu nhiệt, dùng được lò vi sóng, nắp khóa 4 cạnh kín hơi.', sku: 'NX-LL-3',
    weightKg: 1.8, sales: 740, views: 9800, likes: 860, attributes: [attr(200601, 2)],
    models: [{ id: 3000401, tierIndex: [], sku: 'NX-LL-3', price: 459000, stock: 40, promo: 399000 }],
  },
  {
    id: 2000402, shopId: 880004, categoryId: 100060, brandId: 3014, name: 'Chảo chống dính Sunhouse đáy từ', short: 'Chảo Sunhouse',
    description: 'Lớp chống dính 3 lớp, dùng được bếp từ, tay cầm cách nhiệt.', sku: 'NX-SH-PAN',
    weightKg: 1.1, sales: 1500, views: 14000, likes: 1100, attributes: [attr(200601, 1)],
    tiers: [{ name: 'Kích thước', options: ['20cm', '24cm', '28cm'] }],
    models: [
      { id: 3000411, tierIndex: [0], sku: 'NX-SH-20', price: 189000, stock: 35 },
      { id: 3000412, tierIndex: [1], sku: 'NX-SH-24', price: 229000, stock: 40 },
      { id: 3000413, tierIndex: [2], sku: 'NX-SH-28', price: 279000, stock: 16 },
    ],
  },
  {
    id: 2000403, shopId: 880004, categoryId: 100061, brandId: null, name: 'Bình giữ nhiệt inox Nhà Xinh 500ml', short: 'Bình giữ nhiệt 500ml',
    description: 'Bình inox hai lớp, nắp vặn kín với gioăng silicone, dung tích 500ml. Miệng rộng dễ vệ sinh, thân sơn nhám; không dùng trong lò vi sóng.', sku: 'NX-BOTTLE-500',
    weightKg: 0.4, sales: 640, views: 8700, likes: 610, attributes: [attr(200611, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Kem', 'Xanh sage', 'Đen'] }],
    models: [
      { id: 3000421, tierIndex: [0], sku: 'NX-BTL-CREAM', price: 249000, stock: 48 },
      { id: 3000422, tierIndex: [1], sku: 'NX-BTL-SAGE', price: 249000, stock: 34 },
      { id: 3000423, tierIndex: [2], sku: 'NX-BTL-BLACK', price: 249000, stock: 7 },
    ],
    collections: ['Góc sống xanh'],
  },
  {
    id: 2000404, shopId: 880004, categoryId: 100060, brandId: null, name: 'Bộ bát đĩa gốm men mờ Nhà Xinh 4 món', short: 'Bộ gốm men mờ',
    description: 'Bộ gồm hai đĩa và hai bát bằng gốm sứ phủ men mờ màu kem. Dùng được trong máy rửa bát và lò vi sóng; tránh thay đổi nhiệt độ đột ngột.', sku: 'NX-CERAMIC-4',
    weightKg: 2.1, sales: 290, views: 4600, likes: 380, attributes: [attr(200601, 4)],
    models: [{ id: 3000431, tierIndex: [], sku: 'NX-CERAMIC-CREAM', price: 389000, stock: 24, promo: 359000 }],
    collections: ['Bếp gọn đẹp'],
  },
  {
    id: 2000405, shopId: 880004, categoryId: 100062, brandId: null, name: 'Bộ 2 khăn tắm cotton Nhà Xinh 70 × 140cm', short: 'Khăn tắm cotton',
    description: 'Hai khăn tắm cotton dệt vòng, mỗi khăn 70 × 140cm, mềm và thấm hút. Giặt riêng ở lần đầu; tránh dùng chất tẩy mạnh.', sku: 'NX-TOWEL-2',
    weightKg: 0.9, sales: 480, views: 6200, likes: 460, attributes: [attr(200621, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Kem', 'Xám'] }],
    models: [
      { id: 3000441, tierIndex: [0], sku: 'NX-TOWEL-CREAM', price: 279000, stock: 42 },
      { id: 3000442, tierIndex: [1], sku: 'NX-TOWEL-GREY', price: 279000, stock: 31 },
    ],
    collections: ['Chăm chút tổ ấm'],
  },
  {
    id: 2000406, shopId: 880004, categoryId: 100063, brandId: null, name: 'Đèn bàn LED Nhà Xinh cổ ngỗng 3 chế độ sáng', short: 'Đèn bàn LED',
    description: 'Đèn bàn LED cắm USB, cổ đèn linh hoạt, điều khiển cảm ứng với ba chế độ ánh sáng. Công suất 5W, kèm cáp USB; không kèm củ sạc.', sku: 'NX-DESK-LED',
    weightKg: 0.65, sales: 350, views: 5700, likes: 320, attributes: [attr(200631, 1)],
    tiers: [{ name: 'Màu sắc', options: ['Trắng', 'Đen'] }],
    models: [
      { id: 3000451, tierIndex: [0], sku: 'NX-LED-WHITE', price: 319000, stock: 37 },
      { id: 3000452, tierIndex: [1], sku: 'NX-LED-BLACK', price: 319000, stock: 18 },
    ],
    collections: ['Góc làm việc'],
  },
  ...EXPANDED_ITEMS,
];

export const VOUCHERS = [
  { id: 4001, shopId: 880001, code: 'TECH50K', name: 'Giảm 50K đơn từ 500K', voucherType: 1, rewardType: 1, discountAmount: 50000, minBasketPrice: 500000, usageQuantity: 1000, currentUsage: 132, displayChannels: [1] },
  { id: 4002, shopId: 880001, code: 'TECH10', name: 'Giảm 10% tối đa 300K', voucherType: 1, rewardType: 2, percentage: 10, maxPrice: 300000, minBasketPrice: 2000000, usageQuantity: 200, currentUsage: 40, displayChannels: [1] },
  { id: 4003, shopId: 880002, code: 'GLOW15', name: 'Giảm 15% tối đa 60K', voucherType: 1, rewardType: 2, percentage: 15, maxPrice: 60000, minBasketPrice: 250000, usageQuantity: 500, currentUsage: 210, displayChannels: [1] },
  { id: 4004, shopId: 880002, code: 'SERUM30K', name: 'Giảm 30K cho Serum Trà Xanh', voucherType: 2, rewardType: 1, discountAmount: 30000, minBasketPrice: 300000, usageQuantity: 100, currentUsage: 12, displayChannels: [1], itemIds: [2000203] },
  { id: 4005, shopId: 880002, code: 'VIPGLOW', name: 'Ưu đãi khách VIP (ẩn)', voucherType: 1, rewardType: 1, discountAmount: 40000, minBasketPrice: 200000, usageQuantity: 50, currentUsage: 0, displayChannels: [] as number[] },
  { id: 4006, shopId: 880003, code: 'STYLE30K', name: 'Giảm 30K đơn từ 300K', voucherType: 1, rewardType: 1, discountAmount: 30000, minBasketPrice: 300000, usageQuantity: 300, currentUsage: 98, displayChannels: [1] },
  { id: 4007, shopId: 880003, code: 'SUMMER25', name: 'Hè rực rỡ (đã hết hạn)', voucherType: 1, rewardType: 1, discountAmount: 25000, minBasketPrice: 200000, usageQuantity: 300, currentUsage: 300, displayChannels: [1], expired: true },
  { id: 4008, shopId: 880004, code: 'NHAXINH20', name: 'Giảm 20K đơn từ 350K', voucherType: 1, rewardType: 1, discountAmount: 20000, minBasketPrice: 350000, usageQuantity: 100, currentUsage: 7, displayChannels: [1] },
];

/** Historical completed orders that back seeded reviews and seller order history. */
export const HISTORY_ORDERS = [
  { orderSn: '261003SEEDA001', buyerId: 1, shopId: 880001, modelId: 3000121, quantity: 1, dayOffset: 2, rating: 5, comment: 'Tai nghe chống ồn tốt, pin trâu. Giao hàng nhanh!' },
  { orderSn: '261004SEEDA002', buyerId: 2, shopId: 880001, modelId: 3000151, quantity: 2, dayOffset: 3, rating: 4, comment: 'Chuột bấm êm thật sự, dùng văn phòng rất hợp.' },
  { orderSn: '261005SEEDA003', buyerId: 3, shopId: 880002, modelId: 3000211, quantity: 1, dayOffset: 4, rating: 5, comment: 'Toner dịu nhẹ, da bớt dầu rõ rệt sau 2 tuần.' },
  { orderSn: '261006SEEDA004', buyerId: 1, shopId: 880002, modelId: 3000232, quantity: 1, dayOffset: 5, rating: 4, comment: 'Màu son đẹp, hơi khô môi một chút.' },
  { orderSn: '261007SEEDA005', buyerId: 2, shopId: 880003, modelId: 3000305, quantity: 2, dayOffset: 6, rating: 5, comment: 'Áo mặc mát, form chuẩn, sẽ ủng hộ tiếp.' },
  { orderSn: '261008SEEDA006', buyerId: 3, shopId: 880003, modelId: 3000322, quantity: 1, dayOffset: 7, rating: 3, comment: 'Đầm đẹp nhưng màu hơi khác ảnh.' },
  { orderSn: '261009SEEDA007', buyerId: 1, shopId: 880004, modelId: 3000412, quantity: 1, dayOffset: 8, rating: 5, comment: 'Chảo chống dính tốt, dùng bếp từ ok.' },
];
