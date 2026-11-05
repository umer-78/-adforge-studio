import type { ProductRow } from './db';
import { isRecord } from './utils';

/** Product facts as compact JSON for LLM prompts (scripts, research, prompt enhancement). */
export function productFacts(product: ProductRow): string {
  const copy = isRecord(product.copy) ? product.copy : {};
  return JSON.stringify(
    {
      title: product.title,
      brand: product.brand_name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      benefits: copy.benefits,
      features: copy.features,
      audience: copy.audience,
      painPoints: copy.painPoints,
      usps: copy.usps,
      offer: copy.offer,
      tone: copy.tone,
    },
    null,
    1,
  );
}
