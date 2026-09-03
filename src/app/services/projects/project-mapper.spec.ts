import { projectFromApi, toProjectContextRequest, toProjectRequest } from './project-mapper';

describe('project-mapper', () => {
  describe('projectFromApi', () => {
    it('maps the backend shape, including lastUpdateAt', () => {
      const project = projectFromApi({
        id: 'p1',
        name: 'Recruiting',
        description: 'Screening',
        owner: 'alice',
        createdAt: '2026-01-05T09:00:00',
        lastUpdateAt: '2026-01-09T11:30:00',
        flowCount: 3,
        sharedContext: { entries: [{ name: 'tone', type: 'text', value: 'formal' }] }
      });

      expect(project.id).toBe('p1');
      expect(project.name).toBe('Recruiting');
      expect(project.owner).toBe('alice');
      expect(project.flowCount).toBe(3);
      expect(project.updatedAt.getFullYear()).toBe(2026);
      expect(project.sharedContext.entries).toEqual([
        { name: 'tone', type: 'TEXT', multiple: false, value: 'formal', description: null }
      ]);
    });

    it('falls back to createdAt when no update timestamp is present', () => {
      const project = projectFromApi({ id: 'p1', name: 'P', createdAt: '2026-02-01T00:00:00' });

      expect(project.updatedAt.getTime()).toBe(project.createdAt.getTime());
    });

    it('defaults a missing shared context to no entries', () => {
      expect(projectFromApi({ id: 'p1', name: 'P' }).sharedContext).toEqual({ entries: [] });
    });

    it('drops context entries without a name, which could never be referenced', () => {
      const project = projectFromApi({
        id: 'p1',
        name: 'P',
        sharedContext: { entries: [{ type: 'TEXT', value: 'x' }, { name: 'ok', type: 'TEXT' }] }
      });

      expect(project.sharedContext.entries.map((entry) => entry.name)).toEqual(['ok']);
    });

    it('falls back to TEXT for an unknown entry type', () => {
      const project = projectFromApi({
        id: 'p1',
        name: 'P',
        sharedContext: { entries: [{ name: 'x', type: 'SOMETHING_ELSE' }] }
      });

      expect(project.sharedContext.entries[0].type).toBe('TEXT');
    });
  });

  describe('request bodies', () => {
    it('sends an empty description rather than undefined', () => {
      expect(toProjectRequest({ name: 'P' })).toEqual({ name: 'P', description: '' });
    });

    it('serializes context entries with an explicit null description', () => {
      const body = toProjectContextRequest({
        entries: [{ name: 'tone', type: 'TEXT', multiple: false, value: 'formal' }]
      });

      expect(body).toEqual({
        entries: [{ name: 'tone', type: 'TEXT', multiple: false, value: 'formal', description: null }]
      });
    });
  });
});
