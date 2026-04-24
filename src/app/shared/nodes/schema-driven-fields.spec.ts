import {
  buildOrderedSchemaDisplay,
  buildSchemaEditableFieldDefinitions,
  buildSchemaFieldViewModel,
  buildSchemaRetrieverContext,
  deleteSchemaValueByPath,
  parseSchemaRetrieverUrl,
  pruneInactiveSchemaConfiguration,
  resetDependentSchemaRetrieverFields,
  schemaValuesEqual,
  schemaRetrieverMeta,
  setSchemaValueByPath,
  toSchemaRetrieverDependency
} from './schema-driven-fields';

describe('schema-driven-fields', () => {
  it('parses retriever urls including required suffix', () => {
    expect(parseSchemaRetrieverUrl('/retriever/LLM/providers')).toEqual({
      blockType: 'LLM',
      key: 'providers'
    });

    expect(parseSchemaRetrieverUrl('/secure-retriever/Flows/subFlow/required')).toEqual({
      blockType: 'Flows',
      key: 'subFlow'
    });
  });

  it('extracts retriever metadata from schema fields', () => {
    expect(schemaRetrieverMeta({
      type: 'string',
      'x-retriever-name': 'LLM',
      'x-retriever-url': '/retriever/LLM/models',
      'x-retriever-owner': 'LLMDescriptor',
      'x-retriever-structured-data': true,
      'x-retriever-depends-on': ['provider', '$context.flowId']
    }, 'llmDescriptor')).toEqual({
      retrieverBlockType: 'LLM',
      retrieverKey: 'models',
      retrieverUrl: '/retriever/LLM/models',
      retrieverStructuredData: true,
      retrieverDependsOn: [
        { key: 'provider', path: 'llmDescriptor.provider', source: 'field' },
        { key: 'flowId', path: '$context.flowId', source: 'context' }
      ]
    });
  });

  it('converts retriever dependencies using path prefixes', () => {
    expect(toSchemaRetrieverDependency('provider', 'llmDescriptor')).toEqual({
      key: 'provider',
      path: 'llmDescriptor.provider',
      source: 'field'
    });

    expect(toSchemaRetrieverDependency('$context.blockId', 'llmDescriptor')).toEqual({
      key: 'blockId',
      path: '$context.blockId',
      source: 'context'
    });
  });

  it('builds retriever context from field and context dependencies', () => {
    const context = buildSchemaRetrieverContext(
      {
        llmDescriptor: {
          provider: 'OpenAI'
        }
      },
      [
        { key: 'provider', path: 'llmDescriptor.provider', source: 'field' },
        { key: 'flowId', path: '$context.flowId', source: 'context' }
      ],
      {
        baseContext: { locale: 'it' },
        resolveContextDependency: (key) => key === 'flowId' ? 'flow-123' : null
      }
    );

    expect(context).toEqual({
      locale: 'it',
      provider: 'OpenAI',
      flowId: 'flow-123'
    });
  });

  it('builds editable schema field definitions', () => {
    const definitions = buildSchemaEditableFieldDefinitions({
      type: 'object',
      properties: {
        type: {
          type: 'string'
        },
        prompt: {
          type: 'string',
          'x-ui-widget': 'textarea'
        },
        llmDescriptor: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              'x-retriever-url': '/retriever/LLM/providers'
            }
          }
        }
      }
    }, {
      shouldSkip: ({ key }) => key === 'type'
    });

    expect(definitions).toEqual([
      {
        path: 'prompt',
        label: 'Prompt',
        type: 'string',
        enumOptions: [],
        nodeOptionsSource: null,
        retrieverBlockType: null,
        retrieverKey: null,
        retrieverUrl: null,
        retrieverStructuredData: false,
        retrieverDependsOn: [],
        ui: expect.objectContaining({ widget: 'textarea' })
      },
      {
        path: 'llmDescriptor.provider',
        label: 'Provider',
        type: 'string',
        enumOptions: [],
        nodeOptionsSource: null,
        retrieverBlockType: 'LLM',
        retrieverKey: 'providers',
        retrieverUrl: '/retriever/LLM/providers',
        retrieverStructuredData: false,
        retrieverDependsOn: [],
        ui: expect.objectContaining({ widget: null })
      }
    ]);
  });

  it('orders editable schema field definitions using x-ui-property-order and x-ui-order', () => {
    const definitions = buildSchemaEditableFieldDefinitions({
      type: 'object',
      'x-ui-property-order': ['name', 'subFlow', 'maxIterations', 'useLlm', 'guardCondition', 'llmDescriptor', 'guardPrompt'],
      properties: {
        guardPrompt: {
          type: 'string'
        },
        type: {
          type: 'string'
        },
        llmDescriptor: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              'x-ui-order': 20
            },
            provider: {
              type: 'string',
              'x-ui-order': 10
            }
          }
        },
        extraAlpha: {
          type: 'string',
          'x-ui-order': 50
        },
        maxIterations: {
          type: 'integer'
        },
        guardCondition: {
          type: 'string'
        },
        extraBeta: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        subFlow: {
          type: 'string'
        },
        useLlm: {
          type: 'boolean'
        }
      }
    }, {
      shouldSkip: ({ key }) => key === 'type'
    });

    expect(definitions.map((definition) => definition.path)).toEqual([
      'name',
      'subFlow',
      'maxIterations',
      'useLlm',
      'guardCondition',
      'llmDescriptor.provider',
      'llmDescriptor.model',
      'guardPrompt',
      'extraAlpha',
      'extraBeta'
    ]);
  });

  it('builds grouped schema field view models', () => {
    const result = buildSchemaFieldViewModel({
      definitions: [
        {
          path: 'useLlm',
          label: 'Use LLM',
          type: 'boolean' as const,
          ui: { widget: null }
        },
        {
          path: 'prompt',
          label: 'Prompt',
          type: 'string' as const,
          ui: { widget: 'textarea' as const }
        }
      ],
      config: {
        useLlm: true,
        prompt: ''
      },
      richContentPaths: ['prompt'],
      isPathVisible: () => true,
      isPathEnabled: () => true,
      getFieldValue: (definition, config) => String(config[definition.path] ?? ''),
      isFieldWide: (definition) => definition.ui.widget === 'textarea',
      getRichContentParts: () => [],
      resolveGroupLabel: (path) => path === 'useLlm' ? 'Settings' : null,
      groupRichContent: true
    });

    expect(result.parameterFieldGroups).toHaveLength(1);
    expect(result.parameterFieldGroups[0].fields.map((field) => field.path)).toEqual(['useLlm']);
    expect(result.richContentFields.map((field) => field.path)).toEqual(['prompt']);
  });

  it('builds ordered display sections without pushing rich content into grouped fieldsets', () => {
    const result = buildOrderedSchemaDisplay({
      definitions: [
        { path: 'name' },
        { path: 'llmDescriptor.provider' },
        { path: 'llmDescriptor.model' },
        { path: 'prompt' },
        { path: 'examples' }
      ],
      fields: [
        {
          path: 'name',
          label: 'Name',
          value: 'Conditional',
          wide: false,
          expandable: false,
          enabled: true,
          type: 'string' as const,
          booleanValue: false
        },
        {
          path: 'llmDescriptor.provider',
          label: 'Provider',
          value: 'OpenAI',
          wide: false,
          expandable: false,
          enabled: true,
          type: 'string' as const,
          booleanValue: false
        },
        {
          path: 'llmDescriptor.model',
          label: 'Model',
          value: 'gpt-5.4',
          wide: false,
          expandable: false,
          enabled: true,
          type: 'string' as const,
          booleanValue: false
        }
      ],
      richContentFields: [
        {
          path: 'prompt',
          label: 'Prompt',
          rawValue: 'Decide true or false',
          expandable: false,
          parts: [{ text: 'Decide true or false', isDynamicInput: false }]
        }
      ],
      arrayFields: [
        {
          path: 'examples',
          label: 'Examples',
          items: [{ index: 0, summary: 'Example 1' }]
        }
      ],
      resolveGroupLabel: (path) => path.startsWith('llmDescriptor.') ? 'llm' : null
    });

    expect(result.rootItems.map((item) => item.path)).toEqual(['name', 'prompt', 'examples']);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].items.map((item) => item.path)).toEqual([
      'llmDescriptor.provider',
      'llmDescriptor.model'
    ]);
    expect(result.sections.map((section) => section.group?.key ?? section.item?.path)).toEqual([
      'name',
      'group:llm',
      'prompt',
      'examples'
    ]);
  });

  it('updates and deletes nested schema values by path', () => {
    const config: Record<string, unknown> = {};

    setSchemaValueByPath(config, 'llmDescriptor.provider', 'OpenAI');
    setSchemaValueByPath(config, 'llmDescriptor.model', 'gpt-4.1');

    expect(config).toEqual({
      llmDescriptor: {
        provider: 'OpenAI',
        model: 'gpt-4.1'
      }
    });

    deleteSchemaValueByPath(config, 'llmDescriptor.model');
    expect(config).toEqual({
      llmDescriptor: {
        provider: 'OpenAI'
      }
    });

    deleteSchemaValueByPath(config, 'llmDescriptor.provider');
    expect(config).toEqual({});
  });

  it('resets dependent retriever fields recursively', () => {
    const config: Record<string, unknown> = {
      llmDescriptor: {
        provider: 'OpenAI',
        model: 'gpt-4.1',
        deployment: 'prod'
      }
    };

    resetDependentSchemaRetrieverFields(config, 'llmDescriptor.provider', [
      { path: 'llmDescriptor.model', retrieverDependsOn: [{ key: 'provider', path: 'llmDescriptor.provider', source: 'field' }] },
      { path: 'llmDescriptor.deployment', retrieverDependsOn: [{ key: 'model', path: 'llmDescriptor.model', source: 'field' }] }
    ]);

    expect(config).toEqual({
      llmDescriptor: {
        provider: 'OpenAI',
        model: '',
        deployment: ''
      }
    });
  });

  it('prunes inactive schema paths from the configuration', () => {
    const config: Record<string, unknown> = {
      useLlm: false,
      condition: 'done',
      llmDescriptor: {
        provider: 'OpenAI'
      },
      prompt: 'stop?'
    };

    pruneInactiveSchemaConfiguration(
      config,
      ['condition', 'llmDescriptor.provider', 'prompt'],
      (path, source) => source['useLlm'] === false ? path === 'condition' : path !== 'condition'
    );

    expect(config).toEqual({
      useLlm: false,
      condition: 'done'
    });
  });

  it('compares schema values structurally', () => {
    expect(schemaValuesEqual({ provider: 'OpenAI' }, { provider: 'OpenAI' })).toBe(true);
    expect(schemaValuesEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(schemaValuesEqual({ provider: 'OpenAI' }, { provider: 'Anthropic' })).toBe(false);
  });
});
