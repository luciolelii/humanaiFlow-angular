import { Flow } from '@models/flow';
import { Project, UNGROUPED_PROJECT_KEY } from '@models/project';
import { groupFlowsByProject } from './flow-grouping';

function makeFlow(id: string, projectId?: string): Flow {
  return {
    id,
    name: `Flow ${id}`,
    visibility: 'PRIVATE',
    data: { blocks: [], containers: [], connections: [], dependencies: [] },
    author: 'alice',
    createdAt: new Date('2026-01-01'),
    status: 'DRAFT',
    updatedAt: new Date('2026-01-02'),
    projectId
  };
}

function makeProject(id: string, name: string): Project {
  return {
    id,
    name,
    owner: 'alice',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sharedContext: { entries: [] }
  };
}

describe('groupFlowsByProject', () => {
  const zeta = makeProject('p1', 'Zeta');
  const alpha = makeProject('p2', 'Alpha');

  it('still shows a project that has no flows, so a new one is visible', () => {
    // A project the user just created must appear; otherwise it looks like nothing happened.
    const groups = groupFlowsByProject([], [zeta]);

    expect(groups.map((group) => group.key)).toEqual(['p1']);
    expect(groups[0].flows).toEqual([]);
  });

  it('never shows an ungrouped bucket when nothing is ungrouped', () => {
    const groups = groupFlowsByProject([makeFlow('a', 'p1')], [zeta]);

    expect(groups.map((group) => group.key)).toEqual(['p1']);
  });

  it('orders projects by name and always puts the ungrouped bucket last', () => {
    const groups = groupFlowsByProject(
      [makeFlow('a', 'p1'), makeFlow('b'), makeFlow('c', 'p2')],
      [zeta, alpha]
    );

    expect(groups.map((group) => group.key)).toEqual(['p2', 'p1', UNGROUPED_PROJECT_KEY]);
    expect(groups[2].project).toBeNull();
  });

  it('drops empty groups while the list is being narrowed', () => {
    // With a search term active an empty group is noise, not reassurance.
    const groups = groupFlowsByProject([makeFlow('a', 'p1')], [zeta, alpha], { hideEmpty: true });

    expect(groups.map((group) => group.key)).toEqual(['p1']);
  });

  it('keeps every project visible when nothing is narrowing the list', () => {
    const groups = groupFlowsByProject([makeFlow('a', 'p1')], [zeta, alpha]);

    expect(groups.map((group) => group.key)).toEqual(['p2', 'p1']);
  });

  it('keeps the incoming order within a group, so the list sort still applies', () => {
    const groups = groupFlowsByProject(
      [makeFlow('third', 'p1'), makeFlow('first', 'p1'), makeFlow('second', 'p1')],
      [zeta]
    );

    expect(groups[0].flows.map((flow) => flow.id)).toEqual(['third', 'first', 'second']);
  });

  it('treats a flow whose project is unknown as ungrouped instead of hiding it', () => {
    // The backend withholds project membership from non-owners, and ids can go stale; a flow must
    // never disappear from the list because of it.
    const groups = groupFlowsByProject([makeFlow('a', 'deleted-project')], [zeta]);

    const ungrouped = groups.find((group) => group.key === UNGROUPED_PROJECT_KEY);
    expect(ungrouped?.flows).toHaveLength(1);
  });

  it('produces a single ungrouped bucket when there are no projects at all', () => {
    const groups = groupFlowsByProject([makeFlow('a'), makeFlow('b')], []);


    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(UNGROUPED_PROJECT_KEY);
    expect(groups[0].flows).toHaveLength(2);
  });
});
