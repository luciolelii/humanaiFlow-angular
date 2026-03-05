import {
  flattenPrimitiveValues,
  parentPath,
  pathToLabel,
  resolveSchemaRef,
  splitTemplatedTextParts,
  toStringOrNull,
  valueToDisplayString
} from './node-utility';

describe('node-utility', () => {
  it('toStringOrNull returns trimmed non-empty strings and null otherwise', () => {
    expect(toStringOrNull('hello')).toBe('hello');
    expect(toStringOrNull('   ')).toBeNull();
    expect(toStringOrNull(10)).toBeNull();
  });

  it('flattenPrimitiveValues flattens nested objects and skips internal keys', () => {
    const result = flattenPrimitiveValues({
      name: 'Node',
      nested: { value: 5, __internal: 'skip' },
      __meta: 'skip'
    });

    expect(result).toEqual([
      { path: 'name', value: 'Node' },
      { path: 'nested.value', value: 5 }
    ]);
  });

  it('valueToDisplayString formats primitive and empty values', () => {
    expect(valueToDisplayString(null)).toBe('-');
    expect(valueToDisplayString('')).toBe('-');
    expect(valueToDisplayString('ok')).toBe('ok');
    expect(valueToDisplayString(1)).toBe('1');
    expect(valueToDisplayString(false)).toBe('false');
    expect(valueToDisplayString([])).toBe('-');
  });

  it('pathToLabel builds readable labels', () => {
    expect(pathToLabel('message.actionDescription')).toBe('Action Description');
    expect(pathToLabel('step_name')).toBe('Step name');
  });

  it('parentPath returns parent path for nested keys', () => {
    expect(parentPath('a.b.c')).toBe('a.b');
    expect(parentPath('root')).toBeNull();
  });

  it('resolveSchemaRef resolves local schema refs and falls back to input node', () => {
    const root = {
      definitions: {
        Message: { type: 'string' }
      }
    };
    const refNode = { $ref: '#/definitions/Message' };

    expect(resolveSchemaRef(refNode, root)).toEqual({ type: 'string' });
    expect(resolveSchemaRef({ $ref: '#/definitions/Missing' }, root)).toEqual({ $ref: '#/definitions/Missing' });
  });

  it('splitTemplatedTextParts identifies dynamic placeholders', () => {
    const parts = splitTemplatedTextParts('Hello ${{ user.name }}!');
    expect(parts).toEqual([
      { text: 'Hello ', isDynamicInput: false },
      { text: '${{ user.name }}', isDynamicInput: true },
      { text: '!', isDynamicInput: false }
    ]);
  });
});
