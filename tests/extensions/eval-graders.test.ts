import { describe, expect, it } from 'vitest';
import { grade, type RecordedRun } from '../../apps/api/src/assistant/eval/grader.js';
import { reviewInstructions, reviewRun, reviewSchema, type ReviewTransport, type SemanticReview } from '../../apps/api/src/assistant/eval/review.js';
import type { EvalCase } from '../../apps/api/src/assistant/eval/cases/index.js';

const scenario: EvalCase = { id: 'recorded', shop: 1, buyer: 1, language: 'en', question: 'Does this voucher apply?', requiredTool: 'check_voucher', factFields: [] };
const accepted: SemanticReview = { verdict: 'pass', findings: [], rationale: 'The answer preserves the basket condition.' };
const run: RecordedRun = {
  answer: 'One shirt does not meet the minimum; two black XL shirts qualify.', latencyMs: 1,
  tools: [{ name: 'check_voucher', success: true, text: JSON.stringify({ eligible: true, items_subtotal: 378000, min_spend: 300000 }) }],
  review: accepted,
};

describe('execution contracts and independent semantic review', () => {
  it('never marks wording as verified when a review is missing, malformed or uncertain', () => {
    for (const review of [undefined, { ...accepted, verdict: 'uncertain' as const }]) {
      expect(grade(scenario, { ...run, review })).toMatchObject({ passed: false, status: 'unverified' });
    }
    expect(grade(scenario, { ...run, review: { ...accepted, verdict: 'nonsense' } as never }).passed).toBe(false);
  });
  it('uses the semantic finding rather than inferring truth from numbers or negation words', () => {
    const answer = 'One shirt qualifies for the voucher.';
    const result = grade(scenario, { ...run, answer, review: { verdict: 'fail', findings: [{ span: answer, reason: 'The selected one-shirt basket is below the minimum.' }], rationale: 'Product coverage does not imply basket eligibility.' } });
    expect(result.status).toBe('fail');
    expect(result.flags).toContainEqual({ span: answer, reason: 'The selected one-shirt basket is below the minimum.' });
    expect(grade(scenario, run)).toMatchObject({ passed: true, assessment: 'execution_contracts_and_model_review' });
  });
  it('requires actual successful tool execution and actual handoffs independently of wording', () => {
    expect(grade(scenario, { ...run, tools: [{ ...run.tools[0]!, success: false }] }).status).toBe('fail');
    expect(grade({ ...scenario, mustHandoff: true }, run).status).toBe('fail');
    expect(grade({ ...scenario, mustHandoff: true }, { ...run, tools: [...run.tools, { name: 'handoff_to_seller', success: true, text: '{}' }] }).passed).toBe(true);
  });
  it('checks tool data against the independent database snapshot', () => {
    const result = grade({ ...scenario, requiredTool: 'search_products' }, {
      ...run,
      tools: [{ name: 'search_products', success: true, text: JSON.stringify([{ item_id: 1, name: 'Phone', price_min: 200000 }]) }],
      facts: [{ entity: 'Phone', field: 'price', value: '790000' }],
    });
    expect(result.flags.some((flag) => flag.reason === 'tool_db_mismatch')).toBe(true);
  });
  it('accepts the structured no-viewed-product sentinel as a valid tool result', () => {
    expect(grade({ ...scenario, requiredTool: 'get_viewed_product' }, {
      ...run, answer: 'Which product do you mean?', facts: [],
      tools: [{ name: 'get_viewed_product', success: true, text: JSON.stringify({ viewed: false, item: null }) }],
    }).passed).toBe(true);
  });
  it('does not trust a review citing text that the assistant never said', () => {
    expect(grade(scenario, { ...run, review: { verdict: 'fail', findings: [{ span: 'made-up quote', reason: 'Wrong price' }], rationale: 'Unsupported' } }).status).toBe('unverified');
    expect(reviewSchema.safeParse({ ...accepted, findings: [{ span: '', reason: 'Problem' }] }).success).toBe(false);
  });
  it('rejects catalog IDs outside the shop snapshot even with a passing model review', () => {
    const result = grade({ ...scenario, requiredTool: 'search_products' }, {
      ...run, tools: [{ name: 'search_products', success: true, text: JSON.stringify([{ item_id: 99, name: 'Phone', price_min: 790000 }]) }],
      facts: [{ id: '1', entity: 'Phone', field: 'price', value: '790000' }],
    });
    expect(result.flags).toContainEqual({ span: '99', reason: 'Product result absent from shop snapshot' });
  });
});

function fakeReview(response: unknown, toolCall: boolean | 'builtin' = false) {
  const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  const sent: object[] = [];
  let closed = false;
  const transport: ReviewTransport = {
    async start() {},
    async request(method: string, params: object) {
      requests.push({ method, params: params as Record<string, unknown> });
      if (method === 'thread/start') return { thread: { id: 'review-thread' } };
      queueMicrotask(() => {
        if (toolCall === 'builtin') transport.onMessage?.({ method: 'item/started', params: { threadId: 'review-thread', item: { type: 'commandExecution' } } });
        else if (toolCall) transport.onMessage?.({ id: 100, method: 'item/tool/call', params: { threadId: 'review-thread', tool: 'place_order' } });
        else {
          transport.onMessage?.({ method: 'item/completed', params: { threadId: 'review-thread', item: { type: 'agentMessage', text: typeof response === 'string' ? response : JSON.stringify(response) } } });
          transport.onMessage?.({ method: 'turn/completed', params: { threadId: 'review-thread', turn: { status: 'completed' } } });
        }
      });
      return {};
    },
    send(message) { sent.push(message); },
    close() { closed = true; },
  };
  return { transport, requests, sent, isClosed: () => closed };
}

describe('semantic reviewer transport (no Codex process)', () => {
  it('uses a fresh tool-free thread with the exact answer, requirements and evidence', async () => {
    const fake = fakeReview(accepted);
    expect(await reviewRun(scenario, run, fake.transport)).toEqual(accepted);
    expect(fake.requests[0]).toMatchObject({ method: 'thread/start', params: { ephemeral: true, dynamicTools: [], sandbox: 'read-only', developerInstructions: reviewInstructions } });
    expect(fake.requests[0]!.params.cwd).not.toBe(process.cwd());
    const input = fake.requests[1]!.params.input as Array<{ text: string }>;
    expect(JSON.parse(input[0]!.text)).toMatchObject({ test: scenario, answer: run.answer, tools: run.tools });
    expect(fake.isClosed()).toBe(true);
  });
  it('returns invalid output and attempted tool use as unverified errors, never a pass', async () => {
    for (const fake of [fakeReview('not JSON'), fakeReview(accepted, true), fakeReview(accepted, 'builtin'), fakeReview({ verdict: 'fail', findings: [{ span: 'absent', reason: 'Wrong' }], rationale: 'No support' })]) {
      await expect(reviewRun(scenario, run, fake.transport)).rejects.toThrow();
      expect(fake.isClosed()).toBe(true);
    }
  });
});
