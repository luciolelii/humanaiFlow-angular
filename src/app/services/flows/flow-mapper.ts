import { Flow, FlowData, FlowVisibility } from '@models/flow';

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || !value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function flowFromApi(raw: unknown): Flow {
  const value = (raw ?? {}) as Record<string, unknown>;
  const now = new Date();
  const createdAt = parseDate(value['createdAt'], now);
  const updatedAt = parseDate(value['updatedAt'] ?? value['lastUpdateAt'], createdAt);
  const data = (value['data'] ?? value['flow'] ?? {}) as Partial<FlowData>;
  const published = typeof value['published'] === 'boolean'
    ? value['published']
    : ((value['visibility'] as FlowVisibility | undefined) === 'PUBLIC');
  const visibility: FlowVisibility = published ? 'PUBLIC' : 'PRIVATE';

  return {
    id: String(value['id'] ?? crypto.randomUUID()),
    name: String(value['name'] ?? 'Untitled Flow'),
    description: typeof value['description'] === 'string' ? value['description'] : undefined,
    author: String(value['author'] ?? value['owner'] ?? 'unknown'),
    createdAt,
    updatedAt,
    visibility,
    published,
    finalized: typeof value['finalized'] === 'boolean' ? value['finalized'] : undefined,
    data: {
      blocks: Array.isArray(data.blocks) ? data.blocks : [],
      connections: Array.isArray(data.connections) ? data.connections : []
    }
  };
}

export function toFlowCreateRequest(name: string, description?: string, flow?: FlowData) {
  return {
    name,
    description: description ?? '',
    flow: flow ?? {
      blocks: [],
      connections: []
    }
  };
}
