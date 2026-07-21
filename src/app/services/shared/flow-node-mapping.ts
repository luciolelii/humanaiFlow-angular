import { environment } from '@environment';

/**
 * Response-mapping helpers shared by `blocks-call.ts` and `containers-call.ts`
 * (and their `.fake.ts` counterparts): both map the same wire shape — ports,
 * value kinds, position, JSON-schema — into the app's `FlowBlock`/`FlowNode`
 * domain types.
 */

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toApiPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (/^https?:\/\//.test(value)) return value;
  return `${environment.apiUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

export function toPosition(raw: unknown): { x: number; y: number } | undefined {
  const value = toRecord(raw);
  const x = value['x'];
  const y = value['y'];
  if (typeof x !== 'number' || typeof y !== 'number') return undefined;
  return { x, y };
}

export function toSchema(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export function attachSharedDefinitions(
  schema: Record<string, unknown> | null,
  sharedDefinitions: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!schema) return null;
  if (!sharedDefinitions || !Object.keys(sharedDefinitions).length) return schema;

  return {
    ...schema,
    sharedDefinitions: {
      ...sharedDefinitions,
      ...toRecord(schema['sharedDefinitions'])
    }
  };
}

export function toValueKinds(raw: unknown, fallback: { type: string; multiple: boolean }): Array<{ type: string; multiple: boolean }> {
  if (!Array.isArray(raw)) {
    return [{ type: fallback.type, multiple: fallback.multiple }];
  }

  const kinds = raw
    .map((item) => toRecord(item))
    .filter((item) => typeof item['type'] === 'string')
    .map((item) => ({
      type: String(item['type'] ?? fallback.type),
      multiple: Boolean(item['multiple'] ?? false)
    }));

  return kinds.length ? kinds : [{ type: fallback.type, multiple: fallback.multiple }];
}

export function toPorts(
  raw: unknown,
  fallback: Array<{ name: string; type: string; multiple: boolean }> = []
) {
  if (!Array.isArray(raw)) return fallback;
  return raw
    .map((port) => toRecord(port))
    .filter((port) => typeof port['name'] === 'string' && (port['name'] as string).length > 0)
    .map((port) => {
      const type = String(port['type'] ?? 'TEXT');
      const multiple = Boolean(port['multiple'] ?? false);
      return {
        ...port,
        name: String(port['name']),
        type,
        multiple,
        valueKinds: toValueKinds(port['valueKinds'], { type, multiple })
      };
    });
}
