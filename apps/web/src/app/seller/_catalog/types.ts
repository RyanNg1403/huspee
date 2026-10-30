export type Model = {
  model_id: number;
  model_sku: string;
  tier_index: number[];
  price_info: { original_price: number; current_price: number }[];
  stock_info_v2: { summary_info: { total_available_stock: number } };
};
export type Item = {
  item_id: number;
  item_name: string;
  description: string;
  item_sku: string;
  item_status: string;
  category_id: number;
  weight: string;
  has_model: boolean;
  brand?: { brand_id: number };
  attribute_list?: {
    attribute_id: number;
    attribute_value_list: { value_id: number; original_value_name: string }[];
  }[];
  image: { image_url_list: string[]; image_id_list: string[] };
  price_info?: Model['price_info'];
  stock_info_v2?: Model['stock_info_v2'];
  logistic_info: { logistic_id: number; enabled: boolean }[];
};
export type Models = {
  model: Model[];
  tier_variation: { name: string; option_list: { option: string }[] }[];
};
