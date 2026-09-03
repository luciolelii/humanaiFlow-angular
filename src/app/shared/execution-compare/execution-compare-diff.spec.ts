import { diffSide, diffWords } from './execution-compare-diff';

/** Compact rendering of a diff, so the assertions read like the thing they describe. */
function render(parts: ReturnType<typeof diffWords>): string {
  return parts.map((part) =>
    part.kind === 'same' ? part.text : `[${part.kind === 'added' ? '+' : '-'}${part.text}]`
  ).join('');
}

describe('diffWords', () => {
  it('returns a single unchanged part for identical text', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ kind: 'same', text: 'same text' }]);
  });

  it('returns nothing for two empty values', () => {
    expect(diffWords('', '')).toEqual([]);
  });

  it('marks an inserted word', () => {
    expect(render(diffWords('the candidate is strong', 'the candidate is very strong')))
      .toBe('the candidate is [+very ]strong');
  });

  it('marks a removed word', () => {
    expect(render(diffWords('the very strong candidate', 'the strong candidate')))
      .toBe('the [-very ]strong candidate');
  });

  it('marks a substitution as a removal and an addition', () => {
    const rendered = render(diffWords('Score 7/10', 'Score 5/10'));
    expect(rendered).toContain('[-7/10]');
    expect(rendered).toContain('[+5/10]');
  });

  it('treats a value that appeared from nothing as entirely added', () => {
    expect(render(diffWords('', 'brand new'))).toBe('[+brand new]');
  });

  it('rebuilds each side exactly from its own parts', () => {
    // The parts carry whitespace, so a view can render them without re-joining and drifting.
    const left = 'the  candidate   is strong';
    const right = 'the candidate is very strong';
    const parts = diffWords(left, right);

    expect(diffSide(parts, 'left').map((part) => part.text).join('')).toBe(left);
    expect(diffSide(parts, 'right').map((part) => part.text).join('')).toBe(right);
  });

  it('merges neighbouring words of the same kind into one part', () => {
    const parts = diffWords('a b c', 'x y z');
    // Not one part per word: a view would otherwise render a span for every token.
    expect(parts.filter((part) => part.kind === 'removed')).toHaveLength(1);
    expect(parts.filter((part) => part.kind === 'added')).toHaveLength(1);
  });

  it('falls back to whole-value replacement past the size guard', () => {
    // Two long outputs are exactly what this is for, and a quadratic table on them would freeze
    // the view it exists to render.
    const left = Array.from({ length: 2100 }, (_, i) => `w${i}`).join(' ');
    const right = Array.from({ length: 2100 }, (_, i) => `x${i}`).join(' ');

    const parts = diffWords(left, right);

    expect(parts.map((part) => part.kind)).toEqual(['removed', 'added']);
    expect(diffSide(parts, 'left')[0].text).toBe(left);
  });
});
