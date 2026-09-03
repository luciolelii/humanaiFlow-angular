import { Flow, FlowBlock, FlowContainer, FlowData, FlowGlobalInput, FlowLane, FlowStatus, FlowVisibility, normalizeFlowValidationErrors } from '@models/flow';

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
  const project = (value['project'] ?? null) as Record<string, unknown> | null;
  const projectId = typeof value['projectId'] === 'string'
    ? value['projectId']
    : (project && typeof project['id'] === 'string' ? project['id'] : undefined);
  const projectName = typeof value['projectName'] === 'string'
    ? value['projectName']
    : (project && typeof project['name'] === 'string' ? project['name'] : undefined);
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
    projectId,
    projectName,
    validationErrors: normalizeFlowValidationErrors(value['validationErrors'] ?? value['errors']),
    data: {
      blocks: normalizeNodes(data.blocks, 'block') as FlowBlock[],
      containers: normalizeNodes(data.containers, 'container') as FlowContainer[],
      connections: Array.isArray(data.connections) ? data.connections : [],
      dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
      globalInputs: normalizeGlobalInputs(data.globalInputs),
      lanes: normalizeLanes(data.lanes)
    }
  };
}

/**
 * Deliberately omits projectId. This is the body of the full-replace PUT the editor issues on
 * every save, so carrying a project here would silently detach a flow whenever the field was
 * missing. Membership is changed only through FlowsCallService.assignFlowToProject.
 */
export function toFlowCreateRequest(name: string, description?: string, flow?: FlowData, status: FlowStatus = 'DRAFT') {
  return {
    name,
    description: description ?? '',
    status,
    flow: flow ?? {
      blocks: [],
      containers: [],
      connections: [],
      dependencies: [],
      globalInputs: [],
      lanes: []
    }
  };
}

function normalizeGlobalInputs(raw: unknown): FlowGlobalInput[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      name: String(item['name'] ?? '').trim(),
      type: String(item['type'] ?? 'TEXT').toUpperCase() || 'TEXT',
      multiple: Boolean(item['multiple']),
      valueSchema: item['valueSchema'] && typeof item['valueSchema'] === 'object' && !Array.isArray(item['valueSchema'])
        ? item['valueSchema'] as Record<string, unknown>
        : null
    }));
}

function normalizeLanes(raw: unknown): FlowLane[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => ({
      id: String(item['id'] ?? crypto.randomUUID()),
      name: String(item['name'] ?? '').trim(),
      description: typeof item['description'] === 'string' ? item['description'] : null,
      order: Number.isFinite(Number(item['order'])) ? Number(item['order']) : index,
      color: typeof item['color'] === 'string' && item['color'].trim().length > 0 ? item['color'] : null
    }))
    .sort((a, b) => a.order - b.order);
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
