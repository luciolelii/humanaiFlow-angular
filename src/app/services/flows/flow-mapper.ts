import { Flow, FlowBlock, FlowContainer, FlowData, FlowStatus, FlowVisibility, normalizeFlowValidationErrors } from '@models/flow';

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
  const rawStatus = typeof value['status'] === 'string' ? value['status'].toUpperCase() : null;
  const status: FlowStatus = rawStatus === 'EXECUTABLE' ? 'EXECUTABLE' : 'DRAFT';

  return {
    id: String(value['id'] ?? crypto.randomUUID()),
    name: String(value['name'] ?? 'Untitled Flow'),
    description: typeof value['description'] === 'string' ? value['description'] : undefined,
    author: String(value['author'] ?? value['owner'] ?? 'unknown'),
    createdAt,
    status,
    updatedAt,
    visibility,
    published,
    finalized: typeof value['finalized'] === 'boolean' ? value['finalized'] : undefined,
    validationErrors: normalizeFlowValidationErrors(value['validationErrors'] ?? value['errors']),
    data: {
      blocks: normalizeNodes(data.blocks, 'block') as FlowBlock[],
      containers: normalizeNodes(data.containers, 'container') as FlowContainer[],
      connections: Array.isArray(data.connections) ? data.connections : [],
      dependencies: Array.isArray(data.dependencies) ? data.dependencies : []
    }
  };
}

export function toFlowCreateRequest(name: string, description?: string, flow?: FlowData, status: FlowStatus = 'DRAFT') {
  return {
    name,
    description: description ?? '',
    status,
    flow: flow ?? {
      blocks: [],
      containers: [],
      connections: [],
      dependencies: []
    }
  };
}

function normalizeNodes(raw: unknown, nodeFamily: 'block' | 'container'): Array<FlowBlock | FlowContainer> {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value))
    .map((value) => ({
      ...value,
      nodeFamily
    })) as Array<FlowBlock | FlowContainer>;
}
