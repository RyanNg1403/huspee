# Voice runtime

The optional per-shop voice bridge uses `codex-cli 0.166.0` and the operator's existing Codex subscription. It does not use an OpenAI API key. Realtime v3 is experimental; revalidate the protocol before changing the pinned CLI version. Automated tests must use the fake app-server.

Set `ASSISTANT_VOICE_ENABLED=true` in the API environment to enable voice. `ASSISTANT_CODEX_BIN` selects the CLI executable (default `codex`); `ASSISTANT_CODEX_HOME` selects a private writable directory (default `./.token/assistant-codex`, relative to the API process working directory); and `ASSISTANT_MAX_VOICE_SESSIONS` limits concurrent sessions (default 2). The runtime creates the directory and links its `auth.json` to the operator's existing Codex login without reading the credentials. Protect this directory and do not copy, log, or commit credentials. The API needs access to the existing login, and the browser communicates only with the API for signaling and events.

The bridge starts one app-server lazily and a separate ephemeral thread per buyer conversation. The authenticated session determines buyer and shop scope. Tool-backed answers take several seconds: in one wave-0 synthetic Vietnamese run, speech end to acknowledgement was about 1.94 s, to tool call 4.99 s, and to spoken price 9.69 s. These are single observations, not guarantees; microphone quality and noisy environments were not assessed.

If voice is unavailable, check the enable flag, CLI version and path, writable private home, operator login, browser microphone permission, and WebRTC connectivity. An `assistant_busy` response means the concurrent-session limit was reached. Voice sessions close on stop, event disconnect, runtime exit, or five minutes idle. The seller can disable an individual shop's assistant. No live seller chat, real payment, or marketplace-wide assistant is provided.

Text-only sessions use the same enable flag, shop scope, prompt and tools. They start a Codex text thread without WebRTC and reuse the voice session events, text and stop routes. The widget offers typing by choice and after microphone access fails.
