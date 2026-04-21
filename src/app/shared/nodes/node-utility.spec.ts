import {
  evaluateUiConditionRule,
  flattenPrimitiveValues,
  parentPath,
  pathToLabel,
  readUiConditionRule,
  readUiGroup,
  resolveSchemaRef,
  splitTemplatedTextParts,
  getValueByPath,
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

    expect(resolveSchemaRef(refNode, root)).toEqual({ type: 'string', $ref: '#/definitions/Message' });
    expect(resolveSchemaRef({ $ref: '#/definitions/Missing' }, root)).toEqual({ $ref: '#/definitions/Missing' });
  });

  it('resolveSchemaRef keeps local x-ui metadata declared next to $ref', () => {
    const root = {
      definitions: {
        LLMDescriptor: {
          type: 'object',
          properties: {
            provider: { type: 'string' }
          }
        }
      }
    };

    expect(resolveSchemaRef({
      $ref: '#/definitions/LLMDescriptor',
      'x-ui-group': 'llm',
      'x-ui-visible-when': { field: 'useLlm', equals: 'true' }
    }, root)).toEqual({
      $ref: '#/definitions/LLMDescriptor',
      type: 'object',
      properties: {
        provider: { type: 'string' }
      },
      'x-ui-group': 'llm',
      'x-ui-visible-when': { field: 'useLlm', equals: 'true' }
    });
  });

  it('resolveSchemaRef resolves refs declared in sharedDefinitions', () => {
    const root = {
      sharedDefinitions: {
        LLMDescriptor: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            model: { type: 'string' }
          }
        }
      }
    };

    expect(resolveSchemaRef({
      $ref: '#/sharedDefinitions/LLMDescriptor'
    }, root)).toEqual({
      $ref: '#/sharedDefinitions/LLMDescriptor',
      type: 'object',
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' }
      }
    });
  });

  it('getValueByPath resolves nested values', () => {
    expect(getValueByPath({ llm: { enabled: true } }, 'llm.enabled')).toBe(true);
    expect(getValueByPath({ llm: { enabled: true } }, 'llm.missing')).toBeUndefined();
  });

  it('readUiConditionRule parses valid conditional metadata', () => {
    expect(readUiConditionRule({ field: 'useLlm', equals: 'true' })).toEqual({
      field: 'useLlm',
      equals: 'true'
    });
    expect(readUiConditionRule({ field: 'method', in: ['POST', 'PUT'] })).toEqual({
      field: 'method',
      in: ['POST', 'PUT']
    });
    expect(readUiConditionRule({ field: '', equals: 'true' })).toBeNull();
    expect(readUiConditionRule({ field: 'useLlm', equals: true })).toBeNull();
    expect(readUiConditionRule({ field: 'method', in: [] })).toBeNull();
  });

  it('readUiGroup normalizes logical group labels', () => {
    expect(readUiGroup(' llm ')).toBe('llm');
    expect(readUiGroup('   ')).toBeNull();
    expect(readUiGroup(10)).toBeNull();
  });

  it('evaluateUiConditionRule uses schema semantics for booleans and numbers', () => {
    const schemaByPath: Record<string, Record<string, unknown>> = {
      useLlm: { type: 'boolean' },
      retries: { type: 'integer' },
      provider: { type: 'string' }
    };
    const resolveFieldSchema = (path: string) => (schemaByPath[path] as Record<string, any>) ?? null;
    const config = { useLlm: true, retries: 3, provider: 'openai' };

    expect(evaluateUiConditionRule({ field: 'useLlm', equals: 'true' }, config, resolveFieldSchema)).toBe(true);
    expect(evaluateUiConditionRule({ field: 'useLlm', equals: 'false' }, config, resolveFieldSchema)).toBe(false);
    expect(evaluateUiConditionRule({ field: 'retries', equals: '3' }, config, resolveFieldSchema)).toBe(true);
    expect(evaluateUiConditionRule({ field: 'provider', equals: 'openai' }, config, resolveFieldSchema)).toBe(true);
    expect(evaluateUiConditionRule({ field: 'provider', in: ['openai', 'anthropic'] }, config, resolveFieldSchema)).toBe(true);
    expect(evaluateUiConditionRule({ field: 'retries', in: ['1', '3'] }, config, resolveFieldSchema)).toBe(true);
    expect(evaluateUiConditionRule({ field: 'useLlm', in: ['false', 'true'] }, config, resolveFieldSchema)).toBe(true);
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
