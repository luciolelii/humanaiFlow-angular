export type TemplatedTextPart = { text: string; isDynamicInput: boolean };
export type UiConditionRule =
  | { field: string; equals: string }
  | { field: string; in: string[] };

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

export function readUiConditionRule(value: unknown): UiConditionRule | null {
  if (!value || typeof value !== 'object') return null;

  const field = (value as Record<string, unknown>)['field'];
  const equals = (value as Record<string, unknown>)['equals'];
  const includes = (value as Record<string, unknown>)['in'];
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

  return null;
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

  if (type === 'boolean' || typeof actualValue === 'boolean') {
    if (expectedValues) {
      return expectedValues.some((value) => actualValue === parseBooleanCondition(value));
    }
    return expectedValue != null && actualValue === parseBooleanCondition(expectedValue);
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
