export type TemplatedTextPart = { text: string; isDynamicInput: boolean };

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
  return current;
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
