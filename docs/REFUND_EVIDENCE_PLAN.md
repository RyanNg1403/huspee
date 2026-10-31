# Refund requests and seller-reviewed photo evidence

Reviewed implementation plan, 2026-10-31. Branch: `feat/refund-evidence-flow`.

## Product boundary

Buyers can request refund-only or return-and-refund for their own purchases. The backend computes policy eligibility and refund amounts. Photos are private evidence for the owning buyer and authorized shop sellers. The assistant receives attachment metadata only, never pixels, image URLs or vision findings. Only sellers decide approval, rejection/dispute or a revised offer. Seller approval and refund payment remain explicitly simulated.

## Proposed delivery

1. **Private evidence storage and upload.** Add order/buyer-bound evidence records with opaque IDs, immutable normalized image bytes and a digest. Accept JPEG, PNG and WebP, at most 5 MB and 50 megapixels each and eight selected photos per request. Decode and normalize to bounded WebP without EXIF. Use session-authenticated upload/list/content routes; content requires owning buyer or shop membership and `private, no-store` caching. Do not use public catalog `/media` storage or model-visible image URLs. Keep existing return `image_urls` API compatibility.
2. **Exact submission contract.** Add typed `evidence_ids` to buyer return creation and a buyer-controlled conversation selection for `open_return`; the model cannot choose photos. Accept optional explanatory text. Validate ownership, order/shop scope, count and attachment availability. Bind the selected evidence digests, reason, solution, notes and quoted item/quantity/refund snapshot to the pending action. Revalidate and attach evidence atomically on the final single-use tap. Editing a request invalidates prior consent; failed or stale submissions create no partial request. Photos never participate in eligibility or approval.
3. **Complete buyer assistant tools.** Add a read-only eligibility/refund quote and return-status lookup. Add prepared cancellation and seller-offer acceptance actions, with an exact snapshot and a final tap. Preserve shop isolation, legal transitions, idempotency and the seller's authority. Do not add speech heuristics or image classification. Do not store original uploaded names; treat buyer notes as data, not instructions.
4. **Buyer and seller UI.** Reuse one bilingual evidence picker for the buyer's return modal and assistant. Allow selection of an owned shop order, upload, previews, removal from the selected set and explicit evidence-only labeling. The assistant receives only server-verified attachment metadata. Show attachments on confirmation cards and buyer return detail. Sellers see the submitted photos on the existing return-detail page; their existing decision controls remain authoritative. Use direct authenticated image delivery, without a public image optimizer/cache.
5. **Regression and runtime verification.** Test invalid uploads and authorization, cross-buyer/shop/order evidence, snapshot changes and stale taps, atomic attachment binding, replay, eligibility rules, status and revised-offer actions. Test buyer upload and seller review in the browser, using a fake transport for automated assistant tests. Run real Codex text sessions explicitly authorized by the user: an eligible photo-backed request and a disallowed request, verify the model does not decide from photos, submit the eligible request with a real confirmation tap, and open that request as the shop seller. Use generated demo evidence if useful; do not seed/reset the user's database or read credentials. Run affected builds/type checks and the full regression suite.

## Review and completion gates

- Claude reviews this plan in the user's existing tab before implementation. Incorporate findings here and record decisions.
- Implement the agreed plan, then ask the same Claude tab for an independent code review. Resolve material findings and recheck.
- Verify real sessions and seller-side visibility; report concise outcomes, remaining limitations, commit/PR status and links. No actual payment or automatic image-based refund decision.

## Additional contract details for review

- Render private photos from authenticated SDK blob fetches and revoke object URLs on cleanup. Bare image requests omit the seller surface header, so they must not choose a different cookie or become public as a workaround.
- Store the buyer's explicitly selected evidence IDs per active assistant conversation and order. Uploading alone does not select or submit a photo. Selection changes invalidate any pending refund-submission action; confirmation verifies the current selection and its immutable digests.
- The model sees only selected evidence IDs/count and upload metadata needed to attach them, not original filenames, pixels, image URLs or image-derived findings. UI cards may render the photos privately for the human buyer.
- Existing buyer return forms submit their explicit selection directly; the assistant uses the server-owned conversation selection. A removed/unselected upload must not silently reappear in a request.
- Real-session fixtures: buyer 2's existing `DEMOSEEDZ001` mouse order is delivered and inside the return window, with no prior returns; `261004SEEDA002` is an expired order in the same shop. Use these without changing delivery dates, resetting the database or altering recent user purchases. Leave any successfully submitted demo request pending seller review.

## Questions for Claude

- Is the proposed scope coherent and minimal for the complete refund flow discussed with the user?
- Identify gaps in private evidence authorization, atomic binding, immutable consent snapshots, cancellation/offer races, UI consent or backward compatibility.
- Recommend concrete simplifications or corrections. Review only: do not edit source files, run real sessions, or mutate the database. Write at most 30 lines of findings and a revised-plan recommendation to the requested review artifact.

## Claude review adjudication

Reviewed in the user's existing Claude tab; findings: `/tmp/huspee-refund-review.mxjVVa/plan-review.md`. Adopt B1–B5 and M1–M6. The following decisions supersede conflicting draft wording above:

- Separate buyer evidence routes and seller return-evidence routes. A seller can read only photos bound to a submitted return in their shop, never a buyer's drafts. All lists omit bytes. All content is normalized WebP, private/no-store, nosniff and same-origin.
- Do not store original filenames or place image URLs/content in any model surface, including tool cards/results, action views, summary input or app notes. Use numbered photos and opaque IDs only. UI fetches bytes using surface-aware SDK `blob()` requests and revokes object URLs.
- Adopt S1: only the buyer UI selects photos, through a server-owned conversation selection and the action edit route. `open_return` does not accept model-provided evidence IDs, and no evidence-discovery tool is registered. Confirmation cards fetch their exact bound IDs privately; notes and photo count appear in the visible and spoken summary. Selection edits cancel/re-prepare and require a fresh tap.
- Add `get_return_quote` (`can_request`, blocked code, item-only estimate, seller decision required), `get_return_status`, `prepare_return_cancellation`, and `prepare_offer_acceptance`. Claim and apply each mutation in one transaction, comparing the return's version and offer contents. Offer expiry applies to REST and tools. Distinct action types and app outcome speech must be wired throughout.
- Pin the existing workspace sharp version, cap decoded pixels, use one frame, rotate and strip metadata. Cap drafts at 16 per buyer/order, allow deletion while unattached, and lazily clean drafts older than 24 hours during upload. Selected evidence is capped at eight per request. Preserve legacy external `image_urls` separately from private evidence; no private photos enter Shopee-compatible responses.
- D1: keep the existing simulated dispute lifecycle. `JUDGING` means under dispute, not rejected; platform arbitration/terminal dispute resolution is out of scope. Document that limitation. Correct or explicitly disclose cancellation's original-order-state handling; do not conceal a state change.
- Validate the existing in-window fixture before real sessions; use normal persisted API flows for submission and do not adjust delivery dates or reset the database. Real sessions will test machine-rule eligibility and seller-only photo authority, not evaluate the visual truth of evidence.

## Implementation review adjudication

Claude reviewed the staged implementation in the same tab and found no critical privacy or consent bypass. Findings are recorded locally in `/tmp/huspee-refund-review.mxjVVa/code-review.md`. Adopted P2-1–P2-5 and P3-1–P3-6:

- Preserve a pending confirmation on transient transaction conflicts; a retry still revalidates its snapshot, expiry and claim. Invalidate only cards that bind a deleted photo; re-saving an unchanged ordered selection preserves consent.
- Clean expired drafts across all of the buyer's orders on their next upload. This is lazy cleanup, not a scheduled retention service. Attached evidence is immutable and remains available to the buyer and seller after cancellation for review/audit; both cancellation surfaces disclose this decision.
- Hide expired offers in the buyer API and UI. Add exact offer deadlines, forfeiture consequences and photo retention to action readbacks. Use the same stable photo order on confirmation, buyer detail and seller detail.
- Raise the bounded decode cap to 50 megapixels for normal phone photos, retaining 5 MB input, 1600-pixel output and 2 MB normalized-byte limits. Correct the pending-request and simulated-payment UI wording.
- Preserve another order's conversation selection after submission, prioritize the open-request eligibility reason, declare the receipt-state restoration transition, and suppress the obsolete cancellation announcement during a card edit.
- Add natural clock expiry with an unchanged row, conflict retry, seller/REST/card races, different-key taps, tenant/count isolation, photo numbering, cross-order selection preservation, and 24 MP upload tests. Extend the filename canary across tool output, stored actions/messages and UI selection. Add `pnpm smoke:refund-evidence`.
- T5/T6 runtime evidence: the real buyer Next proxy accepted multipart upload in the Linux API container; the real seller Next proxy displayed private Blob content with both session cookies. The mock browser suite remains isolated from real sessions and is not claimed as backend coverage. Summary wording and realtime audio are not independently graded by the canary test; no original filename is retained anywhere in the evidence contract.
- Same-tab follow-up review cleared the merge blockers. Its remaining photo-order, delete-test and same-set-selection observations were resolved. An explicit edit event now drops the obsolete reply and notifies the model without announcing cancellation; replacement notes queue behind active/silent turns. The regression drives a mid-turn edit and both silent `OK` completions, checking one replacement readback and no spoken `OK`. The offer deadline remains exact and explicitly labelled UTC.
- Claude's final focused recheck accepted that queue fix with no remaining merge blocker (`/tmp/huspee-refund-review.mxjVVa/queue-review.md`). These were source reviews; the execution results below were independently obtained by the lead.

## Execution evidence

- Full regression after review fixes: 316 tests across 31 files passed. Workspace type checks, buyer/seller production builds, and Docker image builds passed.
- The lead independently reran `tests/ui/refund-evidence.mjs`: upload limits, explicit selection, photo-only edits with fresh consent, private seller Blob requests with both session cookies, and object URL cleanup passed against mocked APIs.
- Real Codex text conversation `4cf12601-b10b-45ef-962e-3c6ad07baa79` used the existing in-window mouse order. The assistant fetched the order and quote, gave a 349,000 VND item estimate, and explicitly declined to judge the photo or approve the refund. One generated image labeled DEMO EVIDENCE was uploaded through the buyer UI and normalized to 120,250 bytes. A real on-screen tap submitted request `261031110300100647`; a fresh status lookup correctly reported pending seller review and no refund paid.
- The lead opened that request in Seller Centre with both buyer and seller sessions present, inspected its private thumbnail and enlarged image, and left it pending. No seller approval or simulated payment was triggered.
- Real English conversation `6ef63b85-c804-46d9-ad25-55e2b554c69d` checked expired order `261004SEEDA002`. The assistant used the persisted delivery date and quote, gave the correct 14 October deadline, offered seller contact, and created no pending action or return.
- Transcripts and screenshots are local ignored artifacts under `.token/refund-e2e/`; generated evidence and private image bytes are not committed. Containers were updated with seeding disabled; the live database was not reset or reseeded.
- These runs verify the text path and seller UI. Live voice/audio and terminal dispute arbitration were not exercised; `JUDGING` remains the documented simulated unresolved state.

## Develop redesign integration

Integrated `develop` at `b5c131f` (buyer and Seller Centre redesigns). Kept the pinned assistant and new return layout while carrying over private evidence, photo edits, fresh confirmation, verbatim notes and accurate return-action outcomes. Read-only conversation cards do not fetch buyer draft images; sellers use the submitted return gallery. Validation: 382 tests, type checks, API and both frontend builds, scoped frontend lint, and the existing refund browser smoke passed. Existing browser fixtures/selectors were updated; no new test files were added for the rebase.
