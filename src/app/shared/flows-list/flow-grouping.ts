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
 * - Every project gets a group, even with no flows: a project the user just created must be
 *   visible, otherwise it looks like nothing happened - or worse, like the flows moved somewhere
 *   else. Pass `hideEmpty` while a search or filter is narrowing the list, where an empty group
 *   would be noise instead.
 * - A flow whose projectId does not resolve to a known project counts as ungrouped: the backend
 *   withholds project membership from non-owners, and a stale id must never hide a flow.
 */
export function groupFlowsByProject(flows: Flow[], projects: Project[],
    options: { hideEmpty?: boolean } = {}): FlowGroupView[] {
  const byId = new Map(projects.map((project) => [project.id, project]));

  const groups = new Map<string, FlowGroupView>();
  if (!options.hideEmpty) {
    for (const project of projects) {
      groups.set(project.id, { key: project.id, project, flows: [] });
    }
  }

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

  // The ungrouped bucket only ever exists when something is actually in it.
  return [...groups.values()]
      .filter((group) => group.flows.length > 0 || group.project !== null)
      .sort(compareGroups);
}

function compareGroups(a: FlowGroupView, b: FlowGroupView): number {
  if (!a.project) return 1;
  if (!b.project) return -1;
  return a.project.name.localeCompare(b.project.name);
}
