/** The value types a project shared-context entry can hold - mirrors the backend IOType enum. */
export type ProjectContextEntryType = 'TEXT' | 'BOOLEAN' | 'FILE' | 'CSV' | 'JSON';

/**
 * One shared value a project hands to its flows. The `name` is what a flow author writes as
 * `${{project.<name>}}`, so it must be a valid placeholder name and must not start with a
 * reserved prefix (`project.`, `global.`, `context.`, `vars.`) - the backend enforces both.
 */
export type ProjectContextEntry = {
  name: string;
  type: ProjectContextEntryType;
  multiple: boolean;
  value: unknown;
  description?: string | null;
};

export type ProjectContext = {
  entries: ProjectContextEntry[];
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  owner: string;
  createdAt: Date;
  updatedAt: Date;
  sharedContext: ProjectContext;
  /** Only present on the listing shape, which never carries the flows themselves. */
  flowCount?: number;
};

export type ProjectDraft = Pick<Project, 'name'> & { description?: string };

/** Key used for the pseudo-group holding flows that belong to no project. */
export const UNGROUPED_PROJECT_KEY = '__ungrouped__';

const CONTEXT_ENTRY_TYPES: ProjectContextEntryType[] = ['TEXT', 'BOOLEAN', 'FILE', 'CSV', 'JSON'];

export function normalizeSharedContext(raw: unknown): ProjectContext {
  const value = (raw ?? {}) as Record<string, unknown>;
  const rawEntries = Array.isArray(value['entries']) ? value['entries'] : [];

  const entries = rawEntries
    .filter((entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => {
      const type = String(entry['type'] ?? 'TEXT').toUpperCase() as ProjectContextEntryType;
      return {
        name: String(entry['name'] ?? ''),
        type: CONTEXT_ENTRY_TYPES.includes(type) ? type : 'TEXT',
        multiple: Boolean(entry['multiple']),
        value: entry['value'] ?? null,
        description: typeof entry['description'] === 'string' ? entry['description'] : null
      } satisfies ProjectContextEntry;
    })
    .filter((entry) => entry.name.length > 0);

  return { entries };
}

/** The placeholder a flow author writes to read this entry. */
export function projectTemplateReference(name: string): string {
  return `\${{project.${name}}}`;
}

/**
 * Derived from the run's executions; the run keeps no state of its own.
 * BLOCKED = the next step still needs inputs or credentials. STOPPED = a step failed.
 */
export type ProjectRunStatus = 'PENDING' | 'RUNNING' | 'BLOCKED' | 'STOPPED' | 'COMPLETED';

/** One run of a project: the executions started together, tied by `projectRunId`. */
export type ProjectRun = {
  projectRunId: string;
  projectId: string;
  name: string;
  createdAt: number;
  executionCount: number;
  status: ProjectRunStatus;
  currentExecutionId: string | null;
  completedCount: number;
  blockedReason: string | null;
  executionIds: string[];
};

/** What a project run created, and the flows it deliberately left out. */
export type ProjectExecutionPlan = {
  run: ProjectRun;
  skipped: { flowId: string; flowName: string; reason: string }[];
};
