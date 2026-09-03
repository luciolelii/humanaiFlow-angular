import { Project, ProjectContext, ProjectDraft, normalizeSharedContext } from '@models/project';

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || !value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function projectFromApi(raw: unknown): Project {
  const value = (raw ?? {}) as Record<string, unknown>;
  const now = new Date();
  const createdAt = parseDate(value['createdAt'], now);

  return {
    id: String(value['id'] ?? ''),
    name: String(value['name'] ?? 'Untitled Project'),
    description: typeof value['description'] === 'string' ? value['description'] : undefined,
    owner: String(value['owner'] ?? 'unknown'),
    createdAt,
    // The backend field is lastUpdateAt; tolerate updatedAt the way flowFromApi does.
    updatedAt: parseDate(value['updatedAt'] ?? value['lastUpdateAt'], createdAt),
    sharedContext: normalizeSharedContext(value['sharedContext']),
    flowCount: typeof value['flowCount'] === 'number' ? value['flowCount'] : undefined
  };
}

export function toProjectRequest(draft: ProjectDraft) {
  return {
    name: draft.name,
    description: draft.description ?? ''
  };
}

export function toProjectContextRequest(context: ProjectContext) {
  return {
    entries: context.entries.map((entry) => ({
      name: entry.name,
      type: entry.type,
      multiple: entry.multiple,
      value: entry.value,
      description: entry.description ?? null
    }))
  };
}
