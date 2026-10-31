import type { HandoffMessage, HandoffTicket } from '@huspee/sdk';

export type ExcerptLine = { role: 'buyer' | 'assistant'; text: string };
export type HandoffQuestion = { question: string; reason: string | null; excerpt: ExcerptLine[] };

const REASON = '\n\nReason: ';
const ROLE_LINE = /^(USER|ASSISTANT): ?(.*)$/;

/**
 * The assistant's handoff message is written by the backend as
 * `question`, a blank line, `Reason: …`, a blank line, then `USER: …` / `ASSISTANT: …` lines.
 */
export function parseHandoffBody(body: string): HandoffQuestion {
  const marker = body.indexOf(REASON);
  if (marker === -1) return { question: body.trim(), reason: null, excerpt: [] };
  const question = body.slice(0, marker).trim();
  const reasonLines: string[] = [];
  const excerpt: ExcerptLine[] = [];
  for (const line of body.slice(marker + REASON.length).split('\n')) {
    const role = ROLE_LINE.exec(line);
    if (role) excerpt.push({ role: role[1] === 'USER' ? 'buyer' : 'assistant', text: role[2]! });
    else if (excerpt.length) excerpt[excerpt.length - 1]!.text += `\n${line}`;
    else reasonLines.push(line);
  }
  const reason = reasonLines.join('\n').trim();
  return {
    question,
    reason: reason || null,
    excerpt: excerpt.map((line) => ({ ...line, text: line.text.trim() })).filter((line) => line.text),
  };
}

export type ThreadItem =
  | ({ kind: 'handoff'; id: number; at: number } & HandoffQuestion)
  | { kind: 'buyer'; id: number; at: number; text: string }
  | { kind: 'seller'; id: number; at: number; text: string; seen: boolean };

/** Ticket messages in order; the newest `buyer_unread` seller replies are the ones the buyer has not opened yet. */
export function threadItems(messages: HandoffMessage[], buyerUnread: number): ThreadItem[] {
  const sellerCount = messages.filter((m) => m.author === 'SELLER').length;
  let sellerIndex = 0;
  return messages.map((m) => {
    if (m.author === 'ASSISTANT')
      return { kind: 'handoff', id: m.id, at: m.created_at, ...parseHandoffBody(m.body) };
    if (m.author === 'BUYER') return { kind: 'buyer', id: m.id, at: m.created_at, text: m.body };
    const seen = sellerIndex++ < sellerCount - buyerUnread;
    return { kind: 'seller', id: m.id, at: m.created_at, text: m.body, seen };
  });
}

export type TicketState =
  | { kind: 'waiting'; since: number }
  | { kind: 'answered'; at: number }
  | { kind: 'closed' };

/** What the seller needs to know about a ticket at a glance, from its status and latest message. */
export function ticketState(
  ticket: Pick<HandoffTicket, 'status' | 'updated_at' | 'last_message'>,
): TicketState {
  if (ticket.status === 'CLOSED') return { kind: 'closed' };
  const last = ticket.last_message;
  if (ticket.status === 'ANSWERED')
    return { kind: 'answered', at: last?.author === 'SELLER' ? last.created_at : ticket.updated_at };
  return { kind: 'waiting', since: last?.created_at ?? ticket.updated_at };
}
