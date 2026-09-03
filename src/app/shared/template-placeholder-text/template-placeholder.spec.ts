import { buildTemplateSubstitutions, resolveTemplateSegments } from './template-placeholder';

describe('buildTemplateSubstitutions', () => {
  it('prefixes global inputs and execution variables but not plain step inputs', () => {
    const values = buildTemplateSubstitutions(
      { candidateProfile: 'Jane Doe' },
      { cvs: ['cv-1', 'cv-2'] },
      { retryCount: 2 },
      { executionId: 'exec-1', executionName: 'Ranking run' }
    );

    expect(values).toEqual({
      candidateProfile: 'Jane Doe',
      'global.cvs': ['cv-1', 'cv-2'],
      'vars.retryCount': 2,
      'context.executionId': 'exec-1',
      'context.executionName': 'Ranking run'
    });
  });

  it('omits context keys when execution metadata is missing', () => {
    const values = buildTemplateSubstitutions(null, null, null);
    expect(values).toEqual({});
  });
});

describe('resolveTemplateSegments', () => {
  it('returns no segments for empty or missing text', () => {
    expect(resolveTemplateSegments('', {})).toEqual([]);
    expect(resolveTemplateSegments(null, {})).toEqual([]);
    expect(resolveTemplateSegments(undefined, {})).toEqual([]);
  });

  it('returns a single text segment when there are no placeholders', () => {
    expect(resolveTemplateSegments('Plain instructions.', {})).toEqual([
      { kind: 'text', text: 'Plain instructions.', name: '', multiple: false, value: undefined }
    ]);
  });

  it('splits surrounding text from a single non-array placeholder', () => {
    const segments = resolveTemplateSegments(
      'Profile:\n${{candidateProfile}}\nReview it.',
      { candidateProfile: 'Jane Doe, 5 years experience' }
    );

    expect(segments).toEqual([
      { kind: 'text', text: 'Profile:\n', name: '', multiple: false, value: undefined },
      { kind: 'value', text: '', name: 'candidateProfile', multiple: false, value: 'Jane Doe, 5 years experience' },
      { kind: 'text', text: '\nReview it.', name: '', multiple: false, value: undefined }
    ]);
  });

  it('strips the [] marker and marks the segment as multiple', () => {
    const segments = resolveTemplateSegments('CVs:\n${{global.cvs[]}}', { 'global.cvs': ['cv-1', 'cv-2', 'cv-3'] });

    expect(segments[1]).toEqual({
      kind: 'value',
      text: '',
      name: 'global.cvs',
      multiple: true,
      value: ['cv-1', 'cv-2', 'cv-3']
    });
  });

  it('resolves a global-prefixed placeholder against the global. key', () => {
    const segments = resolveTemplateSegments('${{global.cvs}}', { 'global.cvs': 'resolved' });
    expect(segments[0].value).toBe('resolved');
  });

  it('leaves value undefined when the placeholder has no matching substitution', () => {
    const segments = resolveTemplateSegments('${{missing}}', {});
    expect(segments[0]).toEqual({ kind: 'value', text: '', name: 'missing', multiple: false, value: undefined });
  });

  it('does not re-resolve a value that itself contains a placeholder-like string', () => {
    const segments = resolveTemplateSegments(
      '${{candidateProfile}}',
      { candidateProfile: 'Pasted CV mentioning ${{something}} literally' }
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].value).toBe('Pasted CV mentioning ${{something}} literally');
  });

  it('resolves multiple placeholders in one pass, preserving order', () => {
    const segments = resolveTemplateSegments(
      'Hello ${{name}}, your score is ${{score}}.',
      { name: 'Jane', score: 87 }
    );

    expect(segments.map((segment) => (segment.kind === 'value' ? segment.value : segment.text))).toEqual([
      'Hello ',
      'Jane',
      ', your score is ',
      87,
      '.'
    ]);
  });
});

describe('buildTemplateSubstitutions project namespace', () => {
  it('exposes project values under the project prefix', () => {
    const values = buildTemplateSubstitutions(null, null, null, undefined, { tone: 'formal' });

    expect(values['project.tone']).toBe('formal');
  });

  it('keeps every namespace distinct, so no source shadows another', () => {
    // Mirrors the backend: project., global., vars. and a bare input are four different keys.
    const values = buildTemplateSubstitutions(
      { tone: 'from-input' },
      { tone: 'from-global' },
      { tone: 'from-vars' },
      undefined,
      { tone: 'from-project' }
    );

    expect(values['tone']).toBe('from-input');
    expect(values['global.tone']).toBe('from-global');
    expect(values['vars.tone']).toBe('from-vars');
    expect(values['project.tone']).toBe('from-project');
  });

  it('adds nothing when a flow has no project', () => {
    const values = buildTemplateSubstitutions({ a: 1 }, null, null);

    expect(Object.keys(values).some((key) => key.startsWith('project.'))).toBe(false);
  });

  it('resolves a project placeholder in text', () => {
    const segments = resolveTemplateSegments(
      'Write in a ${{project.tone}} tone',
      buildTemplateSubstitutions(null, null, null, undefined, { tone: 'formal' })
    );

    expect(segments.map((segment) => segment.value ?? segment.text).join('')).toContain('formal');
  });
});
