import { TestBed } from '@angular/core/testing';
import { Authorization } from '@services/authorization/authorization';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { Flow, FlowData } from '@models/flow';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { EditorStateHolder } from './flow-editor';

function makeFlow(overrides?: Partial<Flow>): Flow {
  const data: FlowData = { blocks: [], containers: [], connections: [], dependencies: [] };
  return {
    id: 'flow-1',
    name: 'Test Flow',
    visibility: 'PRIVATE',
    data,
    author: 'testuser',
    createdAt: new Date(),
    status: 'DRAFT',
    updatedAt: new Date(),
    ...overrides
  };
}

describe('EditorStateHolder', () => {
  let service: EditorStateHolder;
  let confirmSpy: { open: ReturnType<typeof vi.fn> };
  let authSpy: { loggedInUser: ReturnType<typeof vi.fn> };
  let flowsServiceSpy: { getFlowValidation: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    confirmSpy = {
      open: vi.fn()
    };
    authSpy = {
      loggedInUser: vi.fn().mockReturnValue({ username: 'testuser', email: null, role: 'USER' })
    };
    flowsServiceSpy = {
      getFlowValidation: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        EditorStateHolder,
        { provide: ConfirmDialogService, useValue: confirmSpy },
        { provide: Authorization, useValue: authSpy }
      ]
    });
    service = TestBed.inject(EditorStateHolder);
    service.flowsService = flowsServiceSpy as any;
    flowsServiceSpy.getFlowValidation.mockReturnValue(of([]));
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have no flow initially', () => {
    expect(service.hasFlow()).toBe(false);
    expect(service.currentFlow()).toBeNull();
  });

  describe('openDocument', () => {
    it('should set the current flow', async () => {
      const flow = makeFlow();

      await service.openDocument(flow);

      expect(service.currentFlow()).toMatchObject(flow);
      expect(service.currentFlow()?.validationErrors).toEqual([]);
      expect(service.hasFlow()).toBe(true);
      expect(service.isDirty()).toBe(false);
    });

    it('should prompt confirmation when dirty', async () => {
      const flow1 = makeFlow({ id: 'f1' });
      const flow2 = makeFlow({ id: 'f2' });

      await service.openDocument(flow1);
      service.updateData({
        blocks: [{ id: 'b1', name: 'B1', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'LLMBlock' }],
        containers: [],
        connections: [],
        dependencies: []
      });
      expect(service.isDirty()).toBe(true);

      confirmSpy.open.mockReturnValue(Promise.resolve(false));
      const result = await service.openDocument(flow2);

      expect(result).toBe(false);
      expect(service.currentFlow()!.id).toBe('f1');
    });

    it('should skip dirty check when option is set', async () => {
      const flow1 = makeFlow({ id: 'f1' });
      const flow2 = makeFlow({ id: 'f2' });

      await service.openDocument(flow1);
      service.updateData({
        blocks: [{ id: 'b1', name: 'B1', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'LLMBlock' }],
        containers: [],
        connections: [],
        dependencies: []
      });

      const result = await service.openDocument(flow2, { skipDirtyCheck: true });

      expect(result).toBe(true);
      expect(service.currentFlow()!.id).toBe('f2');
    });
  });

  describe('closeDocument', () => {
    it('should clear the current flow', async () => {
      await service.openDocument(makeFlow());
      service.closeDocument();

      expect(service.currentFlow()).toBeNull();
      expect(service.hasFlow()).toBe(false);
      expect(service.isDirty()).toBe(false);
    });
  });

  describe('updateData', () => {
    it('should mark editor as dirty', async () => {
      await service.openDocument(makeFlow());
      const newData: FlowData = {
        blocks: [{ id: 'b1', name: 'Block1', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'LLMBlock' }],
        containers: [],
        connections: [],
        dependencies: []
      };
      service.updateData(newData);

      expect(service.isDirty()).toBe(true);
    });

    it('should not mark dirty if data unchanged', async () => {
      const flow = makeFlow();

      await service.openDocument(flow);
      service.updateData({ ...flow.data });

      expect(service.isDirty()).toBe(false);
    });
  });

  describe('isCurrentFlowReadOnly', () => {
    it('should return true for finalized flow', async () => {
      await service.openDocument(makeFlow({ finalized: true }));

      expect(service.isCurrentFlowReadOnly()).toBe(true);
    });

    it('should return true for public flow by another author', async () => {
      await service.openDocument(makeFlow({ visibility: 'PUBLIC', author: 'otheruser' }));

      expect(service.isCurrentFlowReadOnly()).toBe(true);
    });

    it('should return false for own private flow', async () => {
      await service.openDocument(makeFlow({ visibility: 'PRIVATE', author: 'testuser' }));

      expect(service.isCurrentFlowReadOnly()).toBe(false);
    });
  });

  describe('block selection', () => {
    it('should set and clear selected blocks', () => {
      service.setSelectedBlocks(['b1', 'b2']);

      expect(service.selectedBlockIds()).toEqual(['b1', 'b2']);
      expect(service.isBlockSelected('b1')).toBe(true);
      expect(service.isBlockSelected('b3')).toBe(false);

      service.clearBlockSelection();
      expect(service.selectedBlockIds()).toEqual([]);
    });

    it('should deduplicate block ids', () => {
      service.setSelectedBlocks(['b1', 'b1', 'b2']);

      expect(service.selectedBlockIds()).toEqual(['b1', 'b2']);
    });
  });

  describe('updateFlowTitle', () => {
    it('should update the title and mark dirty', async () => {
      await service.openDocument(makeFlow({ name: 'Old Title' }));
      service.updateFlowTitle('New Title');

      expect(service.currentFlow()!.name).toBe('New Title');
      expect(service.isDirty()).toBe(true);
    });

    it('should not mark dirty if title unchanged', async () => {
      await service.openDocument(makeFlow({ name: 'Same' }));
      service.updateFlowTitle('Same');

      expect(service.isDirty()).toBe(false);
    });
  });
});
