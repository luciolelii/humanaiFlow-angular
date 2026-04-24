export type TemplatedTextPart = { text: string; isDynamicInput: boolean };
export type UiConditionRule =
  | { field: string; equals: string }
  | { field: string; in: string[] }
  | { field: string; present: boolean };

export type OrderedSchemaPropertyEntry = {
  key: string;
  schema: Record<string, any> | null;
};

export function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return null;
}

export function flattenPrimitiveValues(
  source: Record<string, any>,
  prefix = ''
): Array<{ path: string; value: unknown }> {
  const entries: Array<{ path: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(source ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (key.startsWith('__')) continue;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...flattenPrimitiveValues(value as Record<string, any>, path));
    } else {
      entries.push({ path, value });
    }
  }
  return entries;
}

export function valueToDisplayString(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'string') return value.trim().length ? value : '-';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : '-';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function pathToLabel(path: string): string {
  const lastSegment = path.split('.').at(-1) ?? path;
  return lastSegment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function readUiLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

export function readUiDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

export function schemaFieldLabel(path: string, schema: Record<string, any> | null | undefined): string {
  return readUiLabel(schema?.['x-ui-label']) ?? pathToLabel(path);
}

export function schemaFieldDescription(schema: Record<string, any> | null | undefined): string | null {
  return readUiDescription(schema?.['x-ui-description'])
    ?? (typeof schema?.['x-ui-tip'] === 'string' ? String(schema['x-ui-tip']).trim() || null : null);
}

export function parentPath(path: string): string | null {
  const index = path.lastIndexOf('.');
  if (index <= 0) return null;
  return path.slice(0, index);
}

export function resolveSchemaRef(node: Record<string, any>, root: Record<string, any>) {
  if (!node || typeof node !== 'object') return node;
  const ref = node['$ref'];
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return node;

  const path = ref.slice(2).split('/');
  let current: any = root;
  for (const segment of path) {
    current = current?.[segment];
    if (current == null) return node;
  }
  if (!current || typeof current !== 'object') return node;

  // Keep local wrapper metadata such as x-ui-* when a schema node decorates a $ref.
  return {
    ...current,
    ...node
  };
}

export function resolveSchemaPath(root: Record<string, any> | null | undefined, path: string): Record<string, any> | null {
  if (!root || !path.trim()) return root ?? null;

  let current: Record<string, any> | null = root;
  for (const segment of path.split('.')) {
    if (!current) return null;

    const resolved = resolveSchemaRef(current, root);
    if (!resolved || typeof resolved !== 'object') return null;

    if (/^\d+$/.test(segment)) {
      const items = resolved.items;
      if (!items || typeof items !== 'object') return null;
      current = resolveSchemaRef(items as Record<string, any>, root) as Record<string, any> | null;
      continue;
    }

    const properties = resolved.properties as Record<string, unknown> | undefined;
    if (!properties || !properties[segment]) return null;
    current = resolveSchemaRef(properties[segment] as Record<string, any>, root) as Record<string, any> | null;
  }

  return current;
}

export function orderedSchemaPropertyEntries(
  node: Record<string, any> | null | undefined,
  root: Record<string, any>
): OrderedSchemaPropertyEntry[] {
  if (!node || typeof node !== 'object') return [];

  const resolved = resolveSchemaRef(node, root);
  const properties = resolved?.properties as Record<string, unknown> | undefined;
  if (!properties) return [];

  const propertyOrder = readUiPropertyOrder(resolved?.['x-ui-property-order']);
  const prioritized = new Map<string, number>();
  propertyOrder.forEach((key, index) => {
    if (!prioritized.has(key)) {
      prioritized.set(key, index);
    }
  });

  return Object.entries(properties)
    .map(([key, childSchema], originalIndex) => {
      const resolvedChild = childSchema && typeof childSchema === 'object'
        ? resolveSchemaRef(childSchema as Record<string, any>, root)
        : null;
      const rawOrder = resolvedChild?.['x-ui-order'];
      const uiOrder = typeof rawOrder === 'number' && Number.isInteger(rawOrder) ? rawOrder : null;
      const priorityIndex = prioritized.get(key) ?? null;
      const isTechnical = key === 'type';
      return {
        key,
        schema: resolvedChild,
        originalIndex,
        uiOrder,
        priorityIndex,
        isTechnical
      };
    })
    .sort((left, right) => {
      const leftBucket = left.priorityIndex != null ? 0 : left.isTechnical ? 2 : 1;
      const rightBucket = right.priorityIndex != null ? 0 : right.isTechnical ? 2 : 1;
      if (leftBucket !== rightBucket) return leftBucket - rightBucket;

      if (left.priorityIndex != null && right.priorityIndex != null) {
        return left.priorityIndex - right.priorityIndex;
      }

      const leftHasOrder = left.uiOrder != null;
      const rightHasOrder = right.uiOrder != null;
      if (leftHasOrder !== rightHasOrder) return leftHasOrder ? -1 : 1;
      if (left.uiOrder != null && right.uiOrder != null && left.uiOrder !== right.uiOrder) {
        return left.uiOrder - right.uiOrder;
      }

      return left.originalIndex - right.originalIndex;
    })
    .map(({ key, schema }) => ({ key, schema }));
}

export function readUiConditionRule(value: unknown): UiConditionRule | null {
  if (!value || typeof value !== 'object') return null;

  const field = (value as Record<string, unknown>)['field'];
  const equals = (value as Record<string, unknown>)['equals'];
  const includes = (value as Record<string, unknown>)['in'];
  const present = (value as Record<string, unknown>)['present'];
  if (typeof field !== 'string' || field.trim().length === 0) return null;
  if (typeof equals === 'string') {
    return {
      field: field.trim(),
      equals
    };
  }

  if (Array.isArray(includes)) {
    const values = includes.filter((item): item is string => typeof item === 'string');
    if (!values.length) return null;
    return {
      field: field.trim(),
      in: values
    };
  }

  if (typeof present === 'boolean') {
    return {
      field: field.trim(),
      present
    };
  }

  return null;
}

export function readEffectiveUiVisibleConditionRule(schema: Record<string, any> | null | undefined): UiConditionRule | null {
  return readUiConditionRule(schema?.['x-ui-visible-when'])
    ?? readUiConditionRule(schema?.['x-ui-enabled-when']);
}

export function readUiGroup(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

export function getValueByPath(source: Record<string, any> | null | undefined, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source ?? {});
}

export function validateUniqueByConstraint(
  items: unknown[],
  nextItem: Record<string, unknown>,
  uniqueBy: string | null | undefined,
  currentIndex: number | null,
  isMissingValue: (value: unknown) => boolean,
  areValuesEqual: (left: unknown, right: unknown) => boolean
): { path: string; value: unknown } | null {
  if (!uniqueBy) return null;

  const uniqueValue = getValueByPath(nextItem, uniqueBy);
  if (isMissingValue(uniqueValue)) return null;

  const duplicateIndex = items.findIndex((item, index) => {
    if (currentIndex != null && index === currentIndex) return false;
    const candidateValue = item && typeof item === 'object' && !Array.isArray(item)
      ? getValueByPath(item as Record<string, unknown>, uniqueBy)
      : undefined;
    return areValuesEqual(candidateValue, uniqueValue);
  });

  if (duplicateIndex < 0) return null;

  return {
    path: uniqueBy,
    value: uniqueValue
  };
}

export function shouldSkipSchemaField(key: string, schema: Record<string, any> | null | undefined): boolean {
  if (key.startsWith('__')) return true;
  if (key !== 'type') return false;

  const enumValues = Array.isArray(schema?.['enum'])
    ? schema['enum'].filter((value: unknown): value is string => typeof value === 'string')
    : [];
  const defaultValue = typeof schema?.['default'] === 'string' ? String(schema['default']) : null;

  return enumValues.length === 1 && defaultValue != null && enumValues[0] === defaultValue;
}

export function evaluateUiConditionRule(
  rule: UiConditionRule | null | undefined,
  config: Record<string, any> | null | undefined,
  resolveFieldSchema?: (path: string) => Record<string, any> | null
): boolean {
  if (!rule) return true;

  const actualValue = getValueByPath(config, rule.field);
  const schema = resolveFieldSchema?.(rule.field);
  const schemaType = schema?.['type'];
  const type = typeof schemaType === 'string' ? schemaType : null;
  const expectedValues = 'in' in rule ? rule.in : null;
  const expectedValue = 'equals' in rule ? rule.equals : null;
  const expectedPresence = 'present' in rule ? rule.present : null;
  if (expectedPresence != null) {
    const isPresent = isMeaningfullyPresent(actualValue);
    return isPresent === expectedPresence;
  }

  if (type === 'boolean' || typeof actualValue === 'boolean') {
    const normalizedActual = typeof actualValue === 'boolean' ? actualValue : false;
    if (expectedValues) {
      return expectedValues.some((value) => normalizedActual === parseBooleanCondition(value));
    }
    return expectedValue != null && normalizedActual === parseBooleanCondition(expectedValue);
  }

  if (type === 'number' || type === 'integer' || typeof actualValue === 'number') {
    if (expectedValues) {
      return expectedValues
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .some((value) => actualValue === value);
    }
    const expected = Number(expectedValue);
    return Number.isFinite(expected) && actualValue === expected;
  }

  if (expectedValues) {
    return expectedValues.includes(String(actualValue ?? ''));
  }

  return expectedValue != null && String(actualValue ?? '') === expectedValue;
}

function parseBooleanCondition(value: string): boolean {
  return value.trim().toLowerCase() === 'true';
}

function readUiPropertyOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isMeaningfullyPresent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return true;
  return true;
}

export function isHumanInteractiveNode(interactionContract: unknown): boolean {
  return !!interactionContract;
}

export function isConditionalByPorts(ports: { name: string }[]): boolean {
  const names = ports.map((p) => p.name.trim().toLowerCase());
  return names.includes('true') && names.includes('false');
}

export function formatNodeTitle(blockType: string | null | undefined, fallback = 'Node'): string {
  if (!blockType) return fallback;
  return blockType
    .replace(/Block$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

export function getOutputsTitle(isConditional: boolean): string {
  return isConditional ? 'On Condition' : 'Outputs';
}

export function getOutputPillClass(
  outputKey: string,
  isConditional: boolean,
  schema?: Record<string, unknown> | null
): string | null {
  const outputStyles = schema?.['x-ui-output-styles'];
  if (outputStyles && typeof outputStyles === 'object' && !Array.isArray(outputStyles)) {
    const styleMap = outputStyles as Record<string, unknown>;
    const style = styleMap[outputKey];
    if (typeof style === 'string' && style.trim().length > 0) return style.trim();
  }

  if (!isConditional) return null;
  const normalized = outputKey.trim().toLowerCase();
  if (normalized === 'true') return 'llm-pill-output-true';
  if (normalized === 'false') return 'llm-pill-output-false';
  return null;
}

export function resolveNodeIcon(schema: Record<string, unknown> | null | undefined, hasInteractionContract: boolean): { type: 'class'; value: string } | { type: 'img'; value: string } {
  const icon = schema?.['x-ui-icon'];
  if (typeof icon === 'string' && icon.trim().length > 0) {
    const trimmed = icon.trim();
    if (trimmed.endsWith('.png') || trimmed.endsWith('.svg') || trimmed.endsWith('.jpg') || trimmed.endsWith('.webp')) {
      return { type: 'img', value: trimmed };
    }
    return { type: 'class', value: trimmed };
  }
  if (hasInteractionContract) return { type: 'class', value: 'bi bi-person-check-fill' };
  return { type: 'img', value: 'llm_node.png' };
}

export function splitTemplatedTextParts(text: string | null): TemplatedTextPart[] {
  if (!text) return [];

  const parts: TemplatedTextPart[] = [];
  const re = /\$\{\{[^}]+\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        isDynamicInput: false
      });
    }

    parts.push({
      text: match[0],
      isDynamicInput: true
    });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      isDynamicInput: false
    });
  }

  return parts;
}
