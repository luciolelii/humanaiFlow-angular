/**
 * A word-level diff for the two sides of a comparison.
 *
 * Written here rather than pulled in: no diff library is in the project, the initial bundle is
 * already over its budget, and what is needed is small. Side by side without it, two paragraphs of
 * model output that differ in one clause have to be read twice to find the clause.
 *
 * Word-level rather than character-level because the values are prose: a character diff on a
 * rewritten sentence produces confetti, not an explanation.
 */
export type DiffPartKind = 'same' | 'added' | 'removed';

export type DiffPart = {
  kind: DiffPartKind;
  text: string;
};

/**
 * Splits into words, each carrying its trailing whitespace, so the text can be rebuilt exactly.
 *
 * The whitespace rides along deliberately. As separate tokens the spaces match between any two
 * texts, so a wholly rewritten sentence came back as alternating removed-word / kept-space parts -
 * confetti, which is what word-level diffing is supposed to avoid.
 */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/**
 * Longest common subsequence over the token lists, as a DP table.
 *
 * Quadratic in tokens. Guarded below, because two long model outputs are exactly the case this
 * exists for and a runaway table would freeze the view it is meant to render.
 */
const MAX_TOKENS = 2000;

export function diffWords(left: string, right: string): DiffPart[] {
  if (left === right) {
    return left.length ? [{ kind: 'same', text: left }] : [];
  }

  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  // Beyond this the table costs more than the reading it saves; whole-value replacement is honest.
  if (leftTokens.length > MAX_TOKENS || rightTokens.length > MAX_TOKENS) {
    return compact([
      { kind: 'removed', text: left },
      { kind: 'added', text: right }
    ]);
  }

  const rows = leftTokens.length;
  const columns = rightTokens.length;
  const lengths: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      lengths[i][j] = leftTokens[i] === rightTokens[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (leftTokens[i] === rightTokens[j]) {
      parts.push({ kind: 'same', text: leftTokens[i] });
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      parts.push({ kind: 'removed', text: leftTokens[i] });
      i++;
    } else {
      parts.push({ kind: 'added', text: rightTokens[j] });
      j++;
    }
  }
  while (i < rows) parts.push({ kind: 'removed', text: leftTokens[i++] });
  while (j < columns) parts.push({ kind: 'added', text: rightTokens[j++] });

  return compact(parts);
}

/** Merges neighbouring parts of the same kind, so the view renders spans and not one per word. */
function compact(parts: DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = [];
  for (const part of parts) {
    if (!part.text.length) continue;
    const last = merged[merged.length - 1];
    if (last && last.kind === part.kind) {
      last.text += part.text;
      continue;
    }
    merged.push({ ...part });
  }
  return merged;
}

/** The side of a diff a reader is looking at: removals belong to the left, additions to the right. */
export function diffSide(parts: DiffPart[], side: 'left' | 'right'): DiffPart[] {
  const dropped: DiffPartKind = side === 'left' ? 'added' : 'removed';
  return parts.filter((part) => part.kind !== dropped);
}
