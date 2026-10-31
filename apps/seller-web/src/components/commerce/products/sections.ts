import type { FieldKey, ProductDraft } from './draft';

export type SectionProps = {
  draft: ProductDraft;
  update: (patch: Partial<ProductDraft>) => void;
  errors: FieldKey[];
};
