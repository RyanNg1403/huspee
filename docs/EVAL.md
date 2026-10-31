# Assistant text evaluation

Run explicitly with `pnpm eval:assistant`; it uses the operator's Codex subscription and pinned CLI, never paid API keys. It is never included in `pnpm test`. Each case uses the same voice prompt, tool registry and domain services as the app. Conversations, tool calls and actions run in a database transaction that is always rolled back, so evals do not enter seller insights. The seeded buyer is ID 1.

Options: `--case <id>`, `--shop <id>`, `--limit <n>`, `--out <directory>`, `--fake`, `--regrade <saved-run-directory>`. Relative paths resolve from `apps/api`. Reports contain private transcripts and tool results. Regrading uses the saved evidence and saved semantic review; it starts no Codex process and does not refresh the historical snapshot. Older recordings without a review remain UNVERIFIED.

Two assessments remain separate:

- Execution contracts check that required tools and actual handoffs succeeded, answers are nonempty, and identifiable structured tool data matches the independently loaded shop/buyer database snapshot. They do not interpret buyer or assistant prose.
- After the buyer-facing answer, a fresh, independent, read-only Codex thread receives the question, requirements, complete answer, successful/failed tool records and database snapshot. It uses an empty scratch directory with no registered commerce tools and is instructed to treat all supplied content as data. Any attempted dynamic tool call or non-message/non-reasoning item invalidates the review. This detects tool use; it does not claim the underlying CLI has no built-in capabilities. It reviews semantic support, entity/variant/quantity attribution, negation, voucher conditions, action status, completeness, handoff/refusal requirements and privacy. It returns a strict JSON verdict (pass, fail or uncertain), findings with exact answer excerpts (or an empty span for omissions), and a rationale.

Malformed, absent, timed-out or uncertain model reviews are UNVERIFIED unless an execution-contract failure already establishes FAIL. A PASS requires both execution checks and a passing semantic review. Reports identify the assessment as execution contracts plus model review. The reviewer is fallible; a pass is not proof of semantic correctness and never gates live buyer responses.

The old number/color/code allowlists, arithmetic token combinations, regex claim/negation/persona checks, synonym-based entity attribution, status-label matching and word-overlap paraphrase checks are removed. The answering agent no longer extracts and grades its own claims.

`--fake` uses canned app-server responses and a synthetic review; it checks transport/report plumbing only. `HUSPEE_EVAL_FAKE_WRONG_FIELD=<field>` supplies a deliberately failing fixture; `HUSPEE_EVAL_FAKE_FAIL_TURN=1` simulates a failed answer turn. Neither mode establishes semantic quality. A nonzero exit means FAIL, UNVERIFIED or a run error. No real Codex session runs in automated tests.

get_vouchers and the database snapshot include public unexpired vouchers with buyer redemption status, including already-used, exhausted and upcoming codes. The semantic reviewer distinguishes a buyer-specific restriction from a claim that the shop has no vouchers. check_voucher exposes eligibility for exact proposed lines or the current shop cart. Other missing tool data (such as a return's eligibility or a fully calculated shipping fee) still cannot be asserted merely because the independent snapshot contains it: factual answers must have tool evidence.
