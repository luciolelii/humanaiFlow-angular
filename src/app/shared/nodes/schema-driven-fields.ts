import {
  type UiConditionRule,
  evaluateUiConditionRule,
  getValueByPath,
  parentPath,
  readEffectiveUiVisibleConditionRule,
  readUiConditionRule,
  readUiGroup,
  readUiLabel,
  resolveSchemaRef,
  resolveSchemaPath,
  schemaFieldLabel,
  schemaFieldDescription
} from './node-utility';

export type SchemaFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'unknown';

export type SchemaNodeOptionsSource = {
  collection: 'inputs' | 'outputs';
  valueField: string;
  labelField: string;
};

export type SchemaRetrieverDependency = {
  key: string;
  path: string;
  source: 'field' | 'context';
};

export type SchemaRetrieverMeta = {
  retrieverBlockType: string | null;
  retrieverKey: string | null;
  retrieverUrl: string | null;
  retrieverStructuredData: boolean;
  retrieverDependsOn: SchemaRetrieverDependency[];
};

export type SchemaRetrieverFieldDefinition = {
  path: string;
  retrieverDependsOn: SchemaRetrieverDependency[];
};

export type SchemaFieldUiMeta = {
  widget: 'textarea' | null;
  acceptVariableAsPlaceholder: boolean;
  structural: boolean;
  bindableAsInput: boolean;
  inputName: string | null;
  inputType: string | null;
  inputMultiple: boolean | null;
  structuralReason?: string;
  label?: string;
  placeholder?: string;
  tip?: string;
  rows?: number;
  visibleWhen: UiConditionRule[];
  enabledWhen: UiConditionRule[];
  group: string | null;
};

type SchemaUiInheritance = Pick<SchemaFieldUiMeta, 'visibleWhen' | 'enabledWhen' | 'group'>;

type SchemaLeafFieldContext = {
  key: string;
  path: string;
  pathPrefix: string;
  schema: Record<string, any> | null;
  ui: SchemaFieldUiMeta;
};

export type SchemaFieldGroup<TField, TRichContent = never> = {
  key: string;
  legend: string;
  fields: TField[];
  richContentFields: TRichContent[];
};

export type SchemaEditableFieldDefinition = {
  path: string;
  label: string;
  type: SchemaFieldType;
  enumOptions: string[];
  nodeOptionsSource: SchemaNodeOptionsSource | null;
  ui: SchemaFieldUiMeta;
} & SchemaRetrieverMeta;

export type SchemaParameterFieldView<TType = SchemaFieldType> = {
  path: string;
  label: string;
  value: string;
  wide: boolean;
  expandable: boolean;
  enabled: boolean;
  type: TType;
  booleanValue: boolean;
};

export type SchemaRichContentFieldView = {
  path: string;
  label: string;
  rawValue: string;
  expandable: boolean;
  parts: { text: string; isDynamicInput: boolean }[];
};

export function toSchemaFieldUiMeta(
  schema: Record<string, any> | null | undefined,
  inheritedUi?: SchemaUiInheritance
): SchemaFieldUiMeta {
  const rawWidget = typeof schema?.['x-ui-widget'] === 'string'
    ? String(schema['x-ui-widget']).toLowerCase().trim()
    : '';
  const normalizedWidget: 'textarea' | null =
    rawWidget === 'textarea' || rawWidget === 'text-area' ? 'textarea' : null;
  const placeholder = typeof schema?.['x-ui-placeholder'] === 'string'
    ? String(schema['x-ui-placeholder'])
    : undefined;
  const tip = schemaFieldDescription(schema) ?? undefined;
  const rowsRaw = schema?.['x-ui-rows'];
  const rows = typeof rowsRaw === 'number' && Number.isFinite(rowsRaw) && rowsRaw > 0
    ? Math.trunc(rowsRaw)
    : undefined;
  const acceptVariableAsPlaceholder = schema?.['x-ui-accept-variable-as-placeholder'] === true;
  const structural = schema?.['x-ui-structural'] === true;
  const bindableAsInput = schema?.['x-ui-bindable-as-input'] === true;
  const inputName = typeof schema?.['x-ui-input-name'] === 'string'
    ? String(schema['x-ui-input-name'])
    : null;
  const inputType = typeof schema?.['x-ui-input-type'] === 'string'
    ? String(schema['x-ui-input-type']).toUpperCase()
    : null;
  const inputMultiple = typeof schema?.['x-ui-input-multiple'] === 'boolean'
    ? Boolean(schema['x-ui-input-multiple'])
    : null;
  const structuralReason = typeof schema?.['x-ui-structural-reason'] === 'string'
    ? String(schema['x-ui-structural-reason'])
    : undefined;
  const visibleWhen = readEffectiveUiVisibleConditionRule(schema);
  const enabledWhen = readUiConditionRule(schema?.['x-ui-enabled-when']);
  const label = readUiLabel(schema?.['x-ui-label']) ?? undefined;
  const isObjectLike = schema?.['type'] === 'object' || !!schema?.['properties'];
  const group = readUiGroup(schema?.['x-ui-group'])
    ?? (isObjectLike ? label ?? null : null)
    ?? inheritedUi?.group
    ?? null;

  return {
    widget: normalizedWidget,
    acceptVariableAsPlaceholder,
    structural,
    bindableAsInput,
    inputName,
    inputType,
    inputMultiple,
    structuralReason,
    label,
    placeholder,
    tip,
    rows,
    visibleWhen: [
      ...(inheritedUi?.visibleWhen ?? []),
      ...(visibleWhen ? [visibleWhen] : [])
    ],
    enabledWhen: [
      ...(inheritedUi?.enabledWhen ?? []),
      ...(enabledWhen ? [enabledWhen] : [])
    ],
    group
  };
}

export function getSchemaPathUiMeta(root: Record<string, any> | null | undefined, path: string): SchemaFieldUiMeta {
  if (!root) return toSchemaFieldUiMeta(null);

  let current: Record<string, any> | null = root;
  let inheritedUi: SchemaUiInheritance = {
    visibleWhen: [],
    enabledWhen: [],
    group: null
  };

  for (const segment of path.split('.')) {
    if (!current) return toSchemaFieldUiMeta(null, inheritedUi);

    const resolved = resolveSchemaRef(current, root);
    if (/^\d+$/.test(segment)) {
      const items = resolved?.items;
      if (!items || typeof items !== 'object') return toSchemaFieldUiMeta(null, inheritedUi);
      current = resolveSchemaRef(items as Record<string, any>, root);
    } else {
      const properties = resolved?.properties as Record<string, unknown> | undefined;
      if (!properties || !properties[segment]) return toSchemaFieldUiMeta(null, inheritedUi);
      current = resolveSchemaRef(properties[segment] as Record<string, any>, root);
    }

    const nextUi = toSchemaFieldUiMeta(current, inheritedUi);
    inheritedUi = {
      visibleWhen: nextUi.visibleWhen,
      enabledWhen: nextUi.enabledWhen,
      group: nextUi.group
    };
  }

  return toSchemaFieldUiMeta(current, inheritedUi);
}

export function collectSchemaLeafFields<T>(
  root: Record<string, any> | null | undefined,
  mapLeaf: (context: SchemaLeafFieldContext) => T | null,
  options?: {
    includeArrays?: boolean;
    shouldSkip?: (context: { key: string; path: string; schema: Record<string, any> | null }) => boolean;
  }
): T[] {
  if (!root) return [];

  const fields: T[] = [];
  const seen = new Set<string>();

  const walk = (
    node: Record<string, any>,
    pathPrefix: string,
    inheritedUi?: SchemaUiInheritance
  ) => {
    const resolved = resolveSchemaRef(node, root);
    if (!resolved || typeof resolved !== 'object') return;

    const properties = resolved.properties as Record<string, any> | undefined;
    if (!properties) return;

    for (const [key, childSchema] of Object.entries(properties)) {
      const childResolved = resolveSchemaRef(childSchema as Record<string, any>, root);
      const path = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (options?.shouldSkip?.({ key, path, schema: childResolved })) continue;

      const childUi = toSchemaFieldUiMeta(childResolved, inheritedUi);
      const isArray = childResolved?.type === 'array';
      const hasChildren = !!childResolved?.properties || childResolved?.type === 'object';

      if (isArray && options?.includeArrays !== true) {
        continue;
      }

      if (hasChildren && !isArray) {
        walk(childResolved as Record<string, any>, path, {
          visibleWhen: childUi.visibleWhen,
          enabledWhen: childUi.enabledWhen,
          group: childUi.group
        });
        continue;
      }

      if (seen.has(path)) continue;
      seen.add(path);

      const mapped = mapLeaf({
        key,
        path,
        pathPrefix,
        schema: childResolved,
        ui: childUi
      });
      if (mapped != null) {
        fields.push(mapped);
      }
    }
  };

  walk(root, '');
  return fields;
}

export function groupSchemaFields<TField extends { path: string }, TRichContent extends { path: string }>(
  params: {
    fields: TField[];
    richContentFields?: TRichContent[];
    resolveGroupLabel: (path: string) => string | null;
    resolveLegend?: (groupLabel: string) => string;
  }
): {
  rootFields: TField[];
  rootRichContentFields: TRichContent[];
  groups: Array<SchemaFieldGroup<TField, TRichContent>>;
} {
  const grouped = new Map<string, SchemaFieldGroup<TField, TRichContent>>();
  const rootFields: TField[] = [];
  const rootRichContentFields: TRichContent[] = [];
  const resolveLegend = params.resolveLegend ?? ((groupLabel: string) => groupLabel);

  for (const field of params.fields) {
    const groupLabel = params.resolveGroupLabel(field.path);
    if (!groupLabel) {
      rootFields.push(field);
      continue;
    }
    const groupKey = `group:${groupLabel}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        key: groupKey,
        legend: resolveLegend(groupLabel),
        fields: [],
        richContentFields: []
      });
    }
    grouped.get(groupKey)!.fields.push(field);
  }

  for (const field of params.richContentFields ?? []) {
    const groupLabel = params.resolveGroupLabel(field.path);
    if (!groupLabel) {
      rootRichContentFields.push(field);
      continue;
    }
    const groupKey = `group:${groupLabel}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        key: groupKey,
        legend: resolveLegend(groupLabel),
        fields: [],
        richContentFields: []
      });
    }
    grouped.get(groupKey)!.richContentFields.push(field);
  }

  return {
    rootFields,
    rootRichContentFields,
    groups: Array.from(grouped.values()).filter((group) => group.fields.length > 0 || group.richContentFields.length > 0)
  };
}

export function isSchemaPathVisible(
  root: Record<string, any> | null | undefined,
  path: string,
  config: Record<string, any> | null | undefined
): boolean {
  const ui = getSchemaPathUiMeta(root, path);
  return ui.visibleWhen.every((rule) => evaluateUiConditionRule(rule, config, (fieldPath) => resolveSchemaPath(root, fieldPath)));
}

export function isSchemaPathEnabled(
  root: Record<string, any> | null | undefined,
  path: string,
  config: Record<string, any> | null | undefined
): boolean {
  const ui = getSchemaPathUiMeta(root, path);
  return ui.enabledWhen.every((rule) => evaluateUiConditionRule(rule, config, (fieldPath) => resolveSchemaPath(root, fieldPath)));
}

export function schemaFieldTypeFromSchema(schema: Record<string, any> | null | undefined): SchemaFieldType {
  const type = typeof schema?.['type'] === 'string' ? String(schema['type']) : 'unknown';
  if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') {
    return type;
  }
  return 'unknown';
}

export function schemaEnumOptions(schema: Record<string, any> | null | undefined): string[] {
  const raw = schema?.['enum'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === 'string');
}

export function schemaNodeOptionsSource(schema: Record<string, any> | null | undefined): SchemaNodeOptionsSource | null {
  if (!schema || typeof schema !== 'object') return null;
  const raw = schema['x-ui-options-from-node'];
  if (!raw || typeof raw !== 'object') return null;

  const collection = (raw as Record<string, unknown>)['collection'];
  const valueField = (raw as Record<string, unknown>)['valueField'];
  const labelField = (raw as Record<string, unknown>)['labelField'];
  if ((collection !== 'inputs' && collection !== 'outputs')
    || typeof valueField !== 'string'
    || typeof labelField !== 'string'
    || valueField.trim().length === 0
    || labelField.trim().length === 0) {
    return null;
  }

  return {
    collection,
    valueField: valueField.trim(),
    labelField: labelField.trim()
  };
}

export function parseSchemaRetrieverUrl(rawUrl: unknown): { blockType: string; key: string } | null {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return null;

  const path = rawUrl.split('?')[0];
  const normalizedPath = path.endsWith('/required') ? path.slice(0, -'/required'.length) : path;
  const parts = normalizedPath.split('/').filter(Boolean);
  const retrieverIndex = parts.findIndex((part) => part === 'retriever' || part === 'secure-retriever');
  if (retrieverIndex < 0 || parts.length < retrieverIndex + 3) return null;

  const blockType = parts[retrieverIndex + 1];
  const key = parts[retrieverIndex + 2];
  if (!blockType || !key) return null;

  return { blockType, key };
}

export function toSchemaRetrieverDependency(dependency: string, pathPrefix: string): SchemaRetrieverDependency {
  const normalized = dependency.trim();
  if (normalized.startsWith('$context.')) {
    const contextKey = normalized.slice('$context.'.length).trim();
    return {
      key: contextKey,
      path: normalized,
      source: 'context'
    };
  }

  return {
    key: normalized,
    path: pathPrefix ? `${pathPrefix}.${normalized}` : normalized,
    source: 'field'
  };
}

export function schemaRetrieverMeta(
  schema: Record<string, any> | null | undefined,
  pathPrefix = ''
): SchemaRetrieverMeta {
  if (!schema || typeof schema !== 'object') {
    return {
      retrieverBlockType: null,
      retrieverKey: null,
      retrieverUrl: null,
      retrieverStructuredData: false,
      retrieverDependsOn: []
    };
  }

  const parsedRetrieverUrl = parseSchemaRetrieverUrl(schema['x-retriever-url']);
  const retrieverName = schema['x-retriever-name'];
  const retrieverOwner = schema['x-retriever-owner'];
  const retrieverUrl = typeof schema['x-retriever-url'] === 'string' && schema['x-retriever-url'].trim().length > 0
    ? schema['x-retriever-url'].trim()
    : null;
  const rawDependsOn = Array.isArray(schema['x-retriever-depends-on'])
    ? (schema['x-retriever-depends-on'] as unknown[])
    : [];

  return {
    retrieverBlockType: parsedRetrieverUrl?.blockType
      ?? (typeof retrieverOwner === 'string' && retrieverOwner.trim().length > 0 ? retrieverOwner.trim() : null),
    retrieverKey: parsedRetrieverUrl?.key
      ?? (typeof retrieverName === 'string' && retrieverName.trim().length > 0 ? retrieverName.trim() : null),
    retrieverUrl,
    retrieverStructuredData: schema['x-retriever-structured-data'] === true,
    retrieverDependsOn: rawDependsOn
      .filter((dep): dep is string => typeof dep === 'string' && dep.trim().length > 0)
      .map((dep) => toSchemaRetrieverDependency(dep, pathPrefix))
  };
}

export function buildSchemaRetrieverContext(
  source: Record<string, unknown>,
  dependencies: SchemaRetrieverDependency[],
  options?: {
    baseContext?: Record<string, string>;
    resolveContextDependency?: (key: string) => unknown;
  }
): Record<string, string> {
  const context = { ...(options?.baseContext ?? {}) };
  for (const dependency of dependencies) {
    const value = dependency.source === 'context'
      ? options?.resolveContextDependency?.(dependency.key)
      : getValueByPath(source as Record<string, any>, dependency.path);
    context[dependency.key] = value == null ? '' : String(value);
  }
  return context;
}

export function setSchemaValueByPath(target: Record<string, any>, path: string, value: unknown) {
  const segments = path.split('.').filter(Boolean);
  if (!segments.length) return;

  let current: Record<string, any> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    const next = current[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, any>;
  }

  current[segments[segments.length - 1]] = value;
}

export function deleteSchemaValueByPath(target: Record<string, any>, path: string) {
  const segments = path.split('.').filter(Boolean);
  if (!segments.length) return;

  let current: Record<string, any> | undefined = target;
  const parents: Array<{ owner: Record<string, any>; key: string }> = [];

  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    const next = current?.[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) return;
    parents.push({ owner: current!, key });
    current = next as Record<string, any>;
  }

  if (!current) return;
  delete current[segments[segments.length - 1]];

  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const { owner, key } = parents[index];
    const value = owner[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) break;
    if (Object.keys(value).length > 0) break;
    delete owner[key];
  }
}

export function schemaValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function resetDependentSchemaRetrieverFields(
  config: Record<string, any>,
  changedPath: string,
  definitions: SchemaRetrieverFieldDefinition[],
  visited = new Set<string>()
) {
  const dependentFields = definitions.filter((definition) =>
    definition.retrieverDependsOn.some((dependency) => dependency.path === changedPath)
  );

  for (const field of dependentFields) {
    if (visited.has(field.path)) continue;
    visited.add(field.path);
    setSchemaValueByPath(config, field.path, '');
    resetDependentSchemaRetrieverFields(config, field.path, definitions, visited);
  }
}

export function pruneInactiveSchemaConfiguration(
  config: Record<string, any>,
  candidatePaths: string[],
  isPathActive: (path: string, config: Record<string, any>) => boolean
) {
  const orderedPaths = [...candidatePaths].sort((left, right) => right.length - left.length);
  for (const path of orderedPaths) {
    if (isPathActive(path, config)) continue;
    deleteSchemaValueByPath(config, path);
  }
}

export function isLongTextValue(value: string): boolean {
  return String(value ?? '').trim().length > 80;
}

export function buildTemplatedRichContentParts(
  config: Record<string, any> | null | undefined,
  path: string,
  root: Record<string, any> | null | undefined,
  splitParts: (content: string) => Array<{ text: string; isDynamicInput: boolean }>
): Array<{ text: string; isDynamicInput: boolean }> {
  const content = String(getValueByPath(config ?? {}, path) ?? '').trim();
  if (!content) return [];

  const ui = getSchemaPathUiMeta(root, path);
  if (ui.widget === 'textarea' && ui.acceptVariableAsPlaceholder) {
    return splitParts(content);
  }

  return [{ text: content, isDynamicInput: false }];
}

export function buildSchemaEditableFieldDefinitions(
  root: Record<string, any> | null | undefined,
  options?: {
    includeArrays?: boolean;
    shouldSkip?: (context: { key: string; path: string; schema: Record<string, any> | null }) => boolean;
  }
): SchemaEditableFieldDefinition[] {
  return collectSchemaLeafFields(root, ({ key, path, pathPrefix, schema, ui }) => {
    if (options?.shouldSkip?.({ key, path, schema })) return null;

    return {
      path,
      label: schemaFieldLabel(path, schema),
      type: schemaFieldTypeFromSchema(schema),
      enumOptions: schemaEnumOptions(schema),
      nodeOptionsSource: schemaNodeOptionsSource(schema),
      ...schemaRetrieverMeta(schema, pathPrefix),
      ui
    };
  }, {
    includeArrays: options?.includeArrays
  });
}

export function buildSchemaFieldViewModel<
  TDefinition extends { path: string; label: string; type: TType },
  TType = SchemaFieldType
>(
  params: {
    definitions: TDefinition[];
    config: Record<string, any>;
    richContentPaths: string[];
    isPathVisible: (path: string, config: Record<string, any>) => boolean;
    isPathEnabled: (path: string, config: Record<string, any>) => boolean;
    getFieldValue: (definition: TDefinition, config: Record<string, any>) => string;
    isFieldWide: (definition: TDefinition, renderedValue: string) => boolean;
    getRichContentParts: (path: string, config: Record<string, any>) => Array<{ text: string; isDynamicInput: boolean }>;
    getRichContentRawValue?: (path: string, config: Record<string, any>) => string;
    resolveGroupLabel?: (path: string) => string | null;
    resolveLegend?: (groupLabel: string) => string;
    groupRichContent?: boolean;
  }
): {
  parameterFields: Array<SchemaParameterFieldView<TType>>;
  richContentFields: SchemaRichContentFieldView[];
  parameterFieldGroups: Array<SchemaFieldGroup<SchemaParameterFieldView<TType>, SchemaRichContentFieldView>>;
} {
  const richContentPaths = new Set(params.richContentPaths);
  const richContentFields = params.richContentPaths
    .filter((path) => params.isPathVisible(path, params.config))
    .map((path) => ({
      path,
      label: params.definitions.find((definition) => definition.path === path)?.label ?? schemaFieldLabel(path, null),
      rawValue: params.getRichContentRawValue?.(path, params.config) ?? String(getValueByPath(params.config, path) ?? ''),
      expandable: isLongTextValue(params.getRichContentRawValue?.(path, params.config) ?? String(getValueByPath(params.config, path) ?? '')),
      parts: params.getRichContentParts(path, params.config)
    }));

  const parameterFields = params.definitions
    .filter((definition) => params.isPathVisible(definition.path, params.config))
    .filter((definition) => !richContentPaths.has(definition.path))
    .map((definition) => {
      const value = params.getFieldValue(definition, params.config);
      return {
        path: definition.path,
        label: definition.label,
        value,
        wide: params.isFieldWide(definition, value),
        expandable: isLongTextValue(value),
        enabled: params.isPathEnabled(definition.path, params.config),
        type: definition.type,
        booleanValue: getValueByPath(params.config, definition.path) === true
      } satisfies SchemaParameterFieldView<TType>;
    });

  if (!params.resolveGroupLabel) {
    return {
      parameterFields,
      richContentFields,
      parameterFieldGroups: []
    };
  }

  const grouped = groupSchemaFields({
    fields: parameterFields,
    richContentFields: params.groupRichContent ? richContentFields : undefined,
    resolveGroupLabel: (path) => params.resolveGroupLabel?.(path) ?? parentPath(path),
    resolveLegend: params.resolveLegend
  });

  return {
    parameterFields: grouped.rootFields,
    richContentFields: params.groupRichContent ? grouped.rootRichContentFields : richContentFields,
    parameterFieldGroups: grouped.groups
  };
}
