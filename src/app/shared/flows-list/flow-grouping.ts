import { Flow } from '@models/flow';
import { Project, UNGROUPED_PROJECT_KEY } from '@models/project';

export type FlowGroupView = {
  /** Project id, or UNGROUPED_PROJECT_KEY for the flows that belong to no project. */
  key: string;
  project: Project | null;
  flows: Flow[];
};

/**
 * Groups an already filtered and sorted flow list by project.
 *
 * Rules, fixed deliberately:
 * - Groups keep the incoming flow order, so whatever sort the list applies holds within a group.
 * - Projects are ordered by name; the "no project" group is always last.
 * - A group with no flows is dropped entirely rather than rendered empty - with a search term
 *   active, an empty group is noise.
 * - A flow whose projectId does not resolve to a known project counts as ungrouped: the backend
 *   withholds project membership from non-owners, and a stale id must never hide a flow.
 */
export function groupFlowsByProject(flows: Flow[], projects: Project[]): FlowGroupView[] {
  const byId = new Map(projects.map((project) => [project.id, project]));

  const groups = new Map<string, FlowGroupView>();
  for (const flow of flows) {
    const project = flow.projectId ? byId.get(flow.projectId) ?? null : null;
    const key = project ? project.id : UNGROUPED_PROJECT_KEY;

    const existing = groups.get(key);
    if (existing) {
      existing.flows.push(flow);
    } else {
      groups.set(key, { key, project, flows: [flow] });
    }
  }

  return [...groups.values()].sort(compareGroups);
}

function compareGroups(a: FlowGroupView, b: FlowGroupView): number {
  if (!a.project) return 1;
  if (!b.project) return -1;
  return a.project.name.localeCompare(b.project.name);
}
