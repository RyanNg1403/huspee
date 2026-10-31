export type ExcerptLine = { role: 'buyer' | 'assistant'; text: string };
/** What the buyer sees of an assistant handoff: their question and the transcript sent with it, never the reason. */
export type HandoffQuestion = { question: string; excerpt: ExcerptLine[] };

const REASON = '\n\nReason: ';
const ROLE_LINE = /^(USER|ASSISTANT): ?(.*)$/;

/**
 * The assistant's handoff message is written by the backend as
 * `question`, a blank line, `Reason: …`, a blank line, then `USER: …` / `ASSISTANT: …` lines.
 * Adapted from the Seller Centre parser; the reason is internal and dropped here.
 */
export function parseHandoffBody(body: string): HandoffQuestion {
  const marker = body.indexOf(REASON);
  if (marker === -1) return { question: body.trim(), excerpt: [] };
  const question = body.slice(0, marker).trim();
  const excerpt: ExcerptLine[] = [];
  for (const line of body.slice(marker + REASON.length).split('\n')) {
    const role = ROLE_LINE.exec(line);
    if (role) excerpt.push({ role: role[1] === 'USER' ? 'buyer' : 'assistant', text: role[2]! });
    else if (excerpt.length) excerpt[excerpt.length - 1]!.text += `\n${line}`;
  }
  return {
    question,
    excerpt: excerpt.map((line) => ({ ...line, text: line.text.trim() })).filter((line) => line.text),
  };
}
