import { flowFromApi, toFlowCreateRequest } from './flow-mapper';

describe('flow-mapper', () => {
  describe('flowFromApi', () => {
    it('normalizes lanes sorted by order and defaults missing fields', () => {
      const flow = flowFromApi({
        id: 'flow-1',
        name: 'Test',
        data: {
          blocks: [],
          containers: [],
          connections: [],
          lanes: [
            { id: 'lane-hr', name: 'HR', order: 1, color: '#F59F00' },
            { id: 'lane-mgr', name: 'Manager', order: 0 }
          ]
        }
      });

      expect(flow.data.lanes).toEqual([
        { id: 'lane-mgr', name: 'Manager', order: 0, description: null, color: null },
        { id: 'lane-hr', name: 'HR', order: 1, description: null, color: '#F59F00' }
      ]);
    });

    it('defaults to an empty lanes array when the backend omits it (legacy flows)', () => {
      const flow = flowFromApi({ id: 'flow-1', name: 'Legacy', data: { blocks: [], containers: [], connections: [] } });
      expect(flow.data.lanes).toEqual([]);
    });

    it('passes laneId through on blocks and containers unchanged', () => {
      const flow = flowFromApi({
        id: 'flow-1',
        name: 'Test',
        data: {
          blocks: [{ id: 'b1', name: 'b1', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'LLMBlock', laneId: 'lane-hr' }],
          containers: [{ id: 'c1', name: 'c1', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'GenericContainer', laneId: null }],
          connections: []
        }
      });

      expect(flow.data.blocks[0].laneId).toBe('lane-hr');
      expect(flow.data.containers[0].laneId).toBeNull();
    });

    it('normalizes globalInputs valueSchema, defaulting to null when absent or invalid', () => {
      const flow = flowFromApi({
        id: 'flow-1',
        name: 'Test',
        data: {
          blocks: [], containers: [], connections: [],
          globalInputs: [
            { name: 'dossier', type: 'JSON', multiple: false, valueSchema: { type: 'object' } },
            { name: 'topic', type: 'TEXT', multiple: false }
          ]
        }
      });

      expect(flow.data.globalInputs?.[0].valueSchema).toEqual({ type: 'object' });
      expect(flow.data.globalInputs?.[1].valueSchema).toBeNull();
    });
  });

  describe('toFlowCreateRequest', () => {
    it('defaults to an empty lanes array when no flow data is provided', () => {
      const request = toFlowCreateRequest('Test');
      expect(request.flow.lanes).toEqual([]);
    });

    it('passes the given flow data (including lanes) through untouched', () => {
      const lanes = [{ id: 'lane-1', name: 'HR', order: 0, color: null }];
      const request = toFlowCreateRequest('Test', undefined, {
        blocks: [], containers: [], connections: [], dependencies: [], lanes
      });
      expect(request.flow.lanes).toBe(lanes);
    });
  });
});

describe('flowFromApi and toFlowCreateRequest project membership', () => {
  it('reads projectId and projectName from the API shape', () => {
    const flow = flowFromApi({
      id: 'f1',
      name: 'Flow',
      projectId: 'p1',
      projectName: 'Recruiting'
    });

    expect(flow.projectId).toBe('p1');
    expect(flow.projectName).toBe('Recruiting');
  });

  it('also tolerates a nested project object', () => {
    const flow = flowFromApi({ id: 'f1', name: 'Flow', project: { id: 'p2', name: 'Reporting' } });

    expect(flow.projectId).toBe('p2');
    expect(flow.projectName).toBe('Reporting');
  });

  it('leaves project membership undefined when the API withholds it', () => {
    // A non-owner reading a published flow gets no project, and it must read as unassigned.
    const flow = flowFromApi({ id: 'f1', name: 'Flow' });

    expect(flow.projectId).toBeUndefined();
    expect(flow.projectName).toBeUndefined();
  });

  it('never sends a project in the update body', () => {
    // This body is a full replace used by every editor save. Carrying projectId here - or worse,
    // omitting it while the backend honoured it - would silently detach the flow on every save.
    const body = toFlowCreateRequest('Flow', 'desc', undefined, 'DRAFT') as Record<string, unknown>;

    expect('projectId' in body).toBe(false);
  });
});
