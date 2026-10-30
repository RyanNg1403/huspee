# Voice runtime

The optional per-shop voice bridge uses `codex-cli 0.166.0` and the operator's existing Codex subscription. It does not use an OpenAI API key. Realtime v3 is experimental; revalidate the protocol before changing the pinned CLI version. Automated tests must use the fake app-server.

Set `ASSISTANT_VOICE_ENABLED=true` in the API environment to enable voice. `ASSISTANT_CODEX_BIN` selects the CLI executable (default `codex`); `ASSISTANT_CODEX_HOME` selects a private writable directory (default `./.token/assistant-codex`, relative to the API process working directory); and `ASSISTANT_MAX_VOICE_SESSIONS` limits concurrent sessions (default 2). The runtime creates the directory and links its `auth.json` to the operator's existing Codex login without reading the credentials. Protect this directory and do not copy, log, or commit credentials. The API needs access to the existing login, and the browser communicates only with the API for signaling and events.

The bridge starts one app-server lazily and a separate ephemeral thread per buyer conversation. The authenticated session determines buyer and shop scope. Tool-backed answers take several seconds: in one wave-0 synthetic Vietnamese run, speech end to acknowledgement was about 1.94 s, to tool call 4.99 s, and to spoken price 9.69 s. These are single observations, not guarantees; microphone quality and noisy environments were not assessed.

If voice is unavailable, check the enable flag, CLI version and path, writable private home, operator login, browser microphone permission, and WebRTC connectivity. An `assistant_busy` response means the concurrent-session limit was reached. Voice sessions close on stop, event disconnect, runtime exit, or five minutes idle. The seller can disable an individual shop's assistant. No live seller chat, real payment, or marketplace-wide assistant is provided.

Text-only sessions use the same enable flag, shop scope, prompt and tools. They start a Codex text thread without WebRTC and reuse the voice session events, text and stop routes. The widget offers typing by choice and after microphone access fails.

The pinned schema's flat transcript delta and done notifications have only role and text, with no utterance or response ID; it exposes no speech-started, speech-stopped, or response boundary notifications. Timeline item notifications are separately identified but their relationship to flat transcript events is not specified.

For local protocol debugging, `ASSISTANT_VOICE_TRACE` optionally names a JSONL file receiving app-server notifications. Audio, SDP, and credential-like fields are elided; the file still contains private transcripts and tool results and must be protected and deleted when no longer needed. Tracing is off by default.

An isolated 0.166.0 synthetic-speech capture confirmed that flat realtime transcript deltas and done events carry a thread ID and role but no utterance, response, or item ID. A `thread/realtime/itemAdded` handoff request carried an item ID and input transcript, but in one case its input was only the end of the later user transcript; text-thread `turnId` and item IDs belong to the handoff thread and were not attached to the spoken transcript. During an actual audio overlap, no explicit interruption notification or correlation ID appeared. Two quick utterances were transcribed as one final user text in the captured run. These app-server observations alone do not establish a reliable mapping for all fragments; the separate WebRTC data channel supplies turn IDs as described below.

The live voice widget reads the WebRTC data channel's `turn.created`, `turn.delta`, and `turn.done` events. It creates entries by `turn.id`, appends deltas by `turn_id`, and replaces the text with the final transcript on completion. The observed channel can still combine rapid speech into one protocol turn; the UI cannot split that turn. If the channel never opens, the widget shows each final SSE transcript separately without guessing how fragments correlate. Text-only sessions use the same SSE fallback. Server-side transcript persistence remains separate from this live display.

The interruption label is inferred, not a protocol-provided fact. The browser samples the existing microphone and remote audio tracks: after approximately one second of noise calibration, sustained microphone energy above an adaptive threshold for 300 ms during assistant playback is treated as speech unless it tracks remote energy. An assistant turn ending within 1.5 seconds of that speech onset is labeled interrupted; if audio analysis is unavailable, the earlier channel timing heuristic is used. This is an approximation: echo cancellation, loud speakers, background noise, speech below the threshold, and a natural ending near speech can cause missed or false labels. Audio that ends before sustained speech is detected cannot be labeled retroactively. No audio samples are stored by this detector.

The installed codex-cli 0.166.0 experimental generated TypeScript protocol has no turn-detection, VAD, silence-duration, or eagerness field in `ThreadRealtimeStartParams`; a search of the generated types for those terms found no setting. The runtime therefore cannot configure turn splitting through the exposed app-server protocol, and rapid sentences may still merge.

## Voice output

By default (`ASSISTANT_VOICE_OUTPUT=codex`) the buyer hears Codex's own realtime voice, with the
voice the seller picked in the studio. Facts are checked after they are spoken: when a sentence
states a number, voucher code or colour that no tool result or seller FAQ supports, the server
makes the voice say a correction and logs it as `corrected`.

The realtime voice model does not reliably follow its instructions or hand off on its own, so the
server does not depend on it. The shop identity is also sent as a developer `initialItems` entry.
When the voice answers by itself with anything but a short neutral reply (a fact, more than 80
characters, or talking as a general AI or as having no shop), the server starts the thread turn
with the buyer's words and the previous few utterances, and the tool-backed answer is spoken next.

`ASSISTANT_VOICE_OUTPUT=checked` (opt-in) makes Codex realtime the listener only. Its own audio is
not played. The buyer hears only text the server has checked:

- Thread answers are spoken after every number, voucher code and colour in them appears in a tool
  result or seller FAQ from the conversation; otherwise a fixed "no verified data, ask the seller?"
  sentence is spoken and the attempt is logged as `blocked_unverified`.
- Action read-backs (cart, order, return) are the server's own text, not the model's wording.
- The realtime voice's own sentences are spoken only when they state no fact (short
  acknowledgements). If it states a fact without handing off, the server says it is checking and
  sends the buyer's words to the thread itself. If it says "let me check" and does not hand off
  within 2.5 s, the server also sends the request on.
- Text after the answer that the buyer did not prompt is dropped.

In checked mode the approved text is sent in the `speak` SSE event and the page speaks it with the
browser's speech synthesis; a new buyer turn stops playback. The start response reports the mode as
`voice_output`.

Each realtime turn uses the operator's Codex subscription. When its usage window is exhausted,
Codex may draw on account credits; check usage before long test sessions.

## Speech recognition safeguards

Product search and voucher resolution use shop-scoped verified data; ambiguous results return candidates
instead of selecting one. Spoken Vietnamese and English quantities are parsed conservatively, and cards
show the heard form and server-resolved value when these differ. These lexical confidence values are
matching scores, not speech-recognition probabilities. The buyer can type into an active voice or text
session using the same conversation route.

Push to talk is off by default. When enabled, the microphone track is muted between holds of the talk
button; releasing or cancelling a press mutes it. Voice activity detection still determines boundaries
inside a hold, so a pause may split a long hold. Pending cart, order and return cards offer quantity and variant changes;
the original action is cancelled and a newly validated cart action requires fresh spoken confirmation, and an order or return requires fresh spoken confirmation and an on-screen tap. Editing an order card changes that cart line, then prepares a new order with the same address, payment and voucher.
