# Voice runtime

The optional per-shop voice bridge uses `codex-cli 0.166.0` and the operator's existing Codex subscription. It does not use an OpenAI API key. Realtime v3 is experimental; revalidate the protocol before changing the pinned CLI version. Automated tests must use the fake app-server.

Voice is on by default wherever the Codex CLI is installed; set `ASSISTANT_VOICE_ENABLED=false` in the API environment to turn it off. Where the CLI is missing (the Docker images, for example) the assistant reports itself unavailable instead of failing. `ASSISTANT_CODEX_BIN` selects the CLI executable (default `codex`); `ASSISTANT_CODEX_HOME` selects a private writable directory (default `./.token/assistant-codex`, relative to the API process working directory); and `ASSISTANT_MAX_VOICE_SESSIONS` limits concurrent sessions (default 2). The runtime creates the directory and links its `auth.json` to the operator's existing Codex login without reading the credentials. Protect this directory and do not copy, log, or commit credentials. The API needs access to the existing login, and the browser communicates only with the API for signaling and events.

The bridge starts one app-server lazily and a separate ephemeral thread per buyer conversation. The authenticated session determines buyer and shop scope. Tool-backed answers take several seconds: in one early synthetic Vietnamese run, speech end to acknowledgement was about 1.94 s, to tool call 4.99 s, and to spoken price 9.69 s. These are single observations, not guarantees; microphone quality and noisy environments were not assessed.

If voice is unavailable, check the enable flag, CLI version and path, writable private home, operator login, browser microphone permission, and WebRTC connectivity. An `assistant_busy` response means the concurrent-session limit was reached. Voice sessions close on stop, event disconnect, runtime exit, or five minutes idle. The seller can disable an individual shop's assistant. No live seller chat, real payment, or marketplace-wide assistant is provided.

Text-only sessions use the same enable flag, shop scope, prompt and tools. They start a Codex text thread without WebRTC and reuse the voice session events, text and stop routes. The widget offers typing by choice and after microphone access fails.

The pinned schema's flat transcript delta and done notifications have only role and text, with no utterance or response ID; it exposes no speech-started, speech-stopped, or response boundary notifications. Timeline item notifications are separately identified but their relationship to flat transcript events is not specified.

For local protocol debugging, `ASSISTANT_VOICE_TRACE` optionally names a JSONL file receiving app-server notifications. Audio, SDP, and credential-like fields are elided; the file still contains private transcripts and tool results and must be protected and deleted when no longer needed. Tracing is off by default.

An isolated 0.166.0 synthetic-speech capture confirmed that flat realtime transcript deltas and done events carry a thread ID and role but no utterance, response, or item ID. A `thread/realtime/itemAdded` handoff request carried an item ID and input transcript, but in one case its input was only the end of the later user transcript; text-thread `turnId` and item IDs belong to the handoff thread and were not attached to the spoken transcript. During an actual audio overlap, no explicit interruption notification or correlation ID appeared. Two quick utterances were transcribed as one final user text in the captured run. These app-server observations alone do not establish a reliable mapping for all fragments; the separate WebRTC data channel supplies turn IDs as described below.

The live voice widget reads the WebRTC data channel's `turn.created`, `turn.delta`, and `turn.done` events. It creates entries by `turn.id`, appends deltas by `turn_id`, and replaces the text with the final transcript on completion. The observed channel can still combine rapid speech into one protocol turn; the UI cannot split that turn. If the channel never opens, the widget shows each final SSE transcript separately without guessing how fragments correlate. Text-only sessions use the same SSE fallback. Server-side transcript persistence remains separate from this live display.

The interruption label is inferred, not a protocol-provided fact. The browser samples the existing microphone and remote audio tracks: after approximately one second of noise calibration, microphone audio counts as speech when Silero VAD (v5, run in the browser by `@ricky0123/vad-web` on the same microphone stream) gives the latest 32 ms frame a speech probability of at least 0.6 and the microphone is above the noise floor; 300 ms of such speech during assistant playback is a barge-in unless it tracks remote energy (the assistant's own voice leaking into the microphone). Noise such as a fan, hum, knocks or a clap does not count. The model and ONNX runtime (about 15 MB of WebAssembly and a 2.3 MB model, cached by the browser) are served from `/vad/`; `scripts/copy-vad-assets.mjs` copies them into `apps/web/public/vad` before `dev` and `build`, and that folder is not committed. Until Silero has loaded, or if it fails to load, the detector falls back to loudness alone: microphone energy above an adaptive threshold. An assistant turn ending within 1.5 seconds of that speech onset is labeled interrupted; if audio analysis is unavailable, the earlier channel timing heuristic is used. This is an approximation: echo cancellation, loud speakers, background noise, speech below the threshold, and a natural ending near speech can cause missed or false labels. Audio that ends before sustained speech is detected cannot be labeled retroactively. No audio samples are stored by this detector.

Barge-in does not wait for the server. The page turns the assistant's audio
down after about 120 ms of buyer speech over it and mutes it at 300 ms, using the detector above.
Sound returns when the assistant starts a new turn on the data channel, when the cut-off speech has
been silent for 600 ms, or after 2 s if no buyer turn followed (a false alarm). On the server, a final buyer transcript that
arrives while a thread turn is still answering an earlier utterance interrupts that turn
(`turn/interrupt`) and drops its answer and read-back; once it ends, the new utterance goes to the
thread unless the voice already handed it off (then the server waits 2.5 s for that turn first). A
turn that a handoff started before the buyer's transcript arrived is not treated as stale. The
pinned 0.166.0 protocol has no call to cancel or truncate realtime speech and no VAD settings, so
the voice's own audio is cut only in the browser; the realtime model may still finish the old
sentence silently.

The installed codex-cli 0.166.0 experimental generated TypeScript protocol has no turn-detection, VAD, silence-duration, or eagerness field in `ThreadRealtimeStartParams`; a search of the generated types for those terms found no setting. The runtime therefore cannot configure turn splitting through the exposed app-server protocol, and rapid sentences may still merge.

## Voice output

The buyer hears Codex's own realtime voice, with the voice the seller picked in the studio; the
browser never synthesizes speech itself. Facts are checked after they are spoken: when a sentence
states a number, voucher code or colour that no tool result or seller FAQ supports, the server
makes the voice say a correction and logs it as `corrected`.

The realtime voice model does not reliably follow its instructions or hand off on its own, so the
server does not depend on it. The shop identity is also sent as a developer `initialItems` entry.
When the voice answers by itself with anything but a short neutral reply (a fact, more than 80
characters, or talking as a general AI or as having no shop), the server starts the thread turn
with the buyer's words and the previous few utterances, and the tool-backed answer is spoken next.

Thread answers are checked before the voice says them: they are spoken only when every number,
voucher code and colour in them appears in a tool result or seller FAQ from the conversation;
otherwise a fixed "no verified data, ask the seller?" sentence is spoken and the attempt is logged as
`blocked_unverified`. Action read-backs (cart, order, return) are the server's own text, not the
model's wording. If the voice says "let me check" and does not hand off within 2.5 s, the server
sends the request on.

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
the original action is cancelled and a newly validated cart action requires fresh spoken confirmation, and an order or return requires a fresh on-screen tap. Editing an order card changes that cart line, then prepares a new order with the same address, payment and voucher.

An order or return is confirmed only by the tap; the read-back asks for the tap, not a spoken yes. When
the tap executes or cancels it, the server speaks the outcome itself, tells the realtime voice, and tells
the Codex thread with a silent turn. If the thread was still answering at that moment, its reply (written
before the tap, so likely "please tap") is dropped and the note is sent when its turn completes.
