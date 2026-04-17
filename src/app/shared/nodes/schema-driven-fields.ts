import {
  type UiConditionRule,
  evaluateUiConditionRule,
  getValueByPath,
  readEffectiveUiVisibleConditionRule,
  readUiConditionRule,
  readUiGroup,
  readUiLabel,
  resolveSchemaRef,
  resolveSchemaPath,
  schemaFieldDescription
} from './node-utility';

export type SchemaFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'unknown';

export type SchemaNodeOptionsSource = {
  collection: 'inputs' | 'outputs';
  valueField: string;
  labelField: string;
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
