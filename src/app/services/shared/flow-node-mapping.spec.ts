import { attachSharedDefinitions, toApiPath, toNullableString, toPorts, toPosition, toRecord, toSchema, toValueKinds } from './flow-node-mapping';

describe('toRecord', () => {
  it('returns the object as-is', () => {
    expect(toRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it('returns an empty object for arrays, null, primitives', () => {
    expect(toRecord([1, 2])).toEqual({});
    expect(toRecord(null)).toEqual({});
    expect(toRecord('x')).toEqual({});
  });
});

describe('toNullableString', () => {
  it('passes through non-empty strings and nulls everything else', () => {
    expect(toNullableString('hi')).toBe('hi');
    expect(toNullableString('')).toBeNull();
    expect(toNullableString(42)).toBeNull();
    expect(toNullableString(null)).toBeNull();
  });
});

describe('toApiPath', () => {
  it('passes absolute http(s) URLs through unchanged', () => {
    expect(toApiPath('https://example.com/x')).toBe('https://example.com/x');
  });

  it('prefixes a relative path with the API base URL', () => {
    expect(toApiPath('/retriever/x')).toMatch(/\/retriever\/x$/);
    expect(toApiPath('retriever/x')).toMatch(/\/retriever\/x$/);
  });

  it('returns null for anything that is not a non-empty string', () => {
    expect(toApiPath('')).toBeNull();
    expect(toApiPath(null)).toBeNull();
  });
});

describe('toPosition', () => {
  it('reads a valid {x,y} pair', () => {
    expect(toPosition({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it('returns undefined when x/y are missing or not numeric', () => {
    expect(toPosition({ x: 1 })).toBeUndefined();
    expect(toPosition({ x: '1', y: 2 })).toBeUndefined();
    expect(toPosition(null)).toBeUndefined();
  });
});

describe('toSchema', () => {
  it('accepts a plain object and rejects arrays/primitives/null', () => {
    expect(toSchema({ type: 'object' })).toEqual({ type: 'object' });
    expect(toSchema([1])).toBeNull();
    expect(toSchema('x')).toBeNull();
    expect(toSchema(null)).toBeNull();
  });
});

describe('attachSharedDefinitions', () => {
  it('returns null when there is no schema', () => {
    expect(attachSharedDefinitions(null, { a: 1 })).toBeNull();
  });

  it('returns the schema unchanged when there are no shared definitions', () => {
    const schema = { type: 'object' };
    expect(attachSharedDefinitions(schema, null)).toBe(schema);
    expect(attachSharedDefinitions(schema, {})).toBe(schema);
  });

  it('merges shared definitions into the schema, letting schema-local ones win', () => {
    const schema = { type: 'object', sharedDefinitions: { a: 'local' } };
    expect(attachSharedDefinitions(schema, { a: 'shared', b: 'shared' })).toEqual({
      type: 'object',
      sharedDefinitions: { a: 'local', b: 'shared' }
    });
  });
});

describe('toValueKinds', () => {
  it('falls back to a single kind when raw is not an array', () => {
    expect(toValueKinds(null, { type: 'TEXT', multiple: false })).toEqual([{ type: 'TEXT', multiple: false }]);
  });

  it('maps well-formed entries and drops entries without a string type', () => {
    expect(toValueKinds([{ type: 'FILE', multiple: true }, { multiple: true }], { type: 'TEXT', multiple: false }))
      .toEqual([{ type: 'FILE', multiple: true }]);
  });

  it('falls back when the array yields no usable entries', () => {
    expect(toValueKinds([{ multiple: true }], { type: 'TEXT', multiple: false })).toEqual([{ type: 'TEXT', multiple: false }]);
  });
});

describe('toPorts', () => {
  it('maps named ports and derives valueKinds from type/multiple', () => {
    expect(toPorts([{ name: 'input', type: 'FILE', multiple: true }])).toEqual([
      { name: 'input', type: 'FILE', multiple: true, valueKinds: [{ type: 'FILE', multiple: true }] }
    ]);
  });

  it('drops ports without a usable name', () => {
    expect(toPorts([{ type: 'TEXT' }])).toEqual([]);
  });

  it('returns the fallback (default []) when raw is not an array', () => {
    expect(toPorts(null)).toEqual([]);
    expect(toPorts(null, [{ name: 'fallback', type: 'TEXT', multiple: false }])).toEqual([
      { name: 'fallback', type: 'TEXT', multiple: false }
    ]);
  });
});
