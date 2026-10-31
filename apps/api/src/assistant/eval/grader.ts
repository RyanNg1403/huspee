import type { EvalCase } from './cases';
import { dbMismatches, indexEvidence, type ToolRecord } from './evidence';
import type { Fact } from './facts';
import { reviewSchema, type SemanticReview } from './review';

export interface RecordedRun {
  answer: string;
  tools: ToolRecord[];
  latencyMs: number;
  facts?: Fact[];
  review?: SemanticReview;
  reviewError?: string;
}
export interface Flag { span: string; reason: string }

/** Check structured execution contracts; meaning is assessed separately by the independent reviewer. */
export function grade(test: EvalCase, run: RecordedRun) {
  const flags: Flag[] = [];
  const evidence = indexEvidence(run.tools, run.facts ?? []);
  for (const mismatch of dbMismatches(evidence, run.facts ?? []))
    flags.push({ span: `${mismatch.entity}: ${mismatch.field}=${mismatch.value}`, reason: 'tool_db_mismatch' });
  if (run.facts) {
    const products = run.facts.filter((fact) => fact.field === 'price' || fact.field === 'stock');
    const ids = new Set(products.flatMap((fact) => fact.id ? [fact.id] : []));
    for (const tool of run.tools.filter((tool) => tool.success && ['search_products', 'compare_products', 'get_product_details', 'get_viewed_product'].includes(tool.name))) {
      try {
        const data = JSON.parse(tool.text);
        const rows = tool.name === 'get_viewed_product' && data.viewed === false && data.item === null ? []
          : Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [data];
        for (const row of rows) {
          const known = ids.size ? ids.has(String(row.item_id)) : products.some((fact) => fact.entity === row.name);
          if (!known) flags.push({ span: String(row.item_id ?? row.name ?? tool.name), reason: 'Product result absent from shop snapshot' });
        }
      } catch { flags.push({ span: tool.name, reason: 'Malformed catalog tool result' }); }
    }
  }
  if (test.requiredTool && !run.tools.some((tool) => tool.name === test.requiredTool && tool.success))
    flags.push({ span: test.requiredTool, reason: 'Required successful tool missing' });
  if (test.mustHandoff && !run.tools.some((tool) => tool.name === 'handoff_to_seller' && tool.success))
    flags.push({ span: 'handoff_to_seller', reason: 'Required successful handoff missing' });
  if (!run.answer.trim()) flags.push({ span: '', reason: 'Empty answer' });
  const contractFailed = flags.length > 0;
  const parsed = reviewSchema.safeParse(run.review);
  const review = parsed.success ? parsed.data : undefined;
  const validSpans = review?.findings.every((finding) => !finding.span || run.answer.includes(finding.span));
  if (review && validSpans && review.verdict === 'fail') flags.push(...review.findings);
  const unverified = !review || !validSpans || review.verdict === 'uncertain';
  if (unverified) flags.push({ span: '', reason: run.reviewError ?? 'Semantic review unavailable or uncertain; wording has not been verified' });
  const status = contractFailed || (review?.verdict === 'fail' && validSpans)
    ? 'fail' : unverified ? 'unverified' : 'pass';
  return { id: test.id, passed: status === 'pass', status, flags, latencyMs: run.latencyMs, assessment: 'execution_contracts_and_model_review' as const };
}
