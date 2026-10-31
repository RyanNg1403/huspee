export type PriceInfo = { original_price: number; current_price: number };
export type StockInfo = { summary_info: { total_available_stock: number } };

export type Model = {
  model_id: number;
  model_sku: string;
  tier_index: number[];
  price_info: PriceInfo[];
  stock_info_v2: StockInfo;
};

export type TierVariation = { name: string; option_list: Array<{ option: string }> };

export type Item = {
  item_id: number;
  item_name: string;
  description: string;
  item_sku: string;
  item_status: string;
  category_id: number;
  weight: string;
  dimension: { package_length: number; package_width: number; package_height: number };
  has_model: boolean;
  brand?: { brand_id: number };
  attribute_list?: Array<{
    attribute_id: number;
    attribute_value_list: Array<{ value_id: number; original_value_name: string }>;
  }>;
  image: { image_url_list: string[]; image_id_list: string[] };
  price_info?: PriceInfo[];
  stock_info_v2?: StockInfo;
  logistic_info: Array<{ logistic_id: number; enabled: boolean }>;
};

export type Category = { category_id: number; display_category_name: string; has_children: boolean };

export type Attribute = {
  attribute_id: number;
  mandatory: boolean;
  name: string;
  multi_lang: Array<{ language: string; value: string }>;
  attribute_info: { input_type: number };
  attribute_value_list: Array<{
    value_id: number;
    name: string;
    multi_lang?: Array<{ language: string; value: string }>;
  }>;
};

export type Brand = { brand_id: number; display_brand_name: string };

export type Channel = { logistics_channel_id: number; logistics_channel_name: string; enabled: boolean };
