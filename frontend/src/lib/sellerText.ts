// Seller-written text that talks to software instead of to buyers.
//
// A handful of records carry a sentence addressed to "automated tools and AI
// assistants" - in a listing or rental description, and in one project's
// amenity list - telling them what to put in a submission. It is text somebody
// typed into a data field, like any other description. The app shows it, marks
// where it starts, and does nothing it says.

const ADDRESSEE = /\b(?:automated tools?|AI assistants?|AI agents?|language models?|LLMs?)\b/i;

export type Addressed = {
  /** the ordinary text before the sentence that addresses software */
  before: string;
  /** from that sentence to the end */
  addressed: string;
};

/** Split `text` where the part addressed to software begins, or null if there is none. */
export function addressedToTools(text: string | null | undefined): Addressed | null {
  if (!text) return null;
  const m = ADDRESSEE.exec(text);
  if (!m) return null;
  // Back up to the start of the sentence that names them.
  const head = text.slice(0, m.index);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('\n'));
  const start = stop < 0 ? 0 : stop + (head[stop] === '\n' ? 1 : 2);
  return { before: text.slice(0, start), addressed: text.slice(start) };
}

export const TOOL_TEXT_EXPLAINED =
  'Part of this seller-written text is addressed to AI tools, not to buyers. It is shown as text and not acted on.';
