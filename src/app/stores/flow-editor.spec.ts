import { TestBed } from '@angular/core/testing';
import { EditorStateHolder } from './flow-editor';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { Authorization } from '@services/authorization/authorization';
import { FlowsService } from '@services/flows/flows';
import { Flow, FlowData } from '@models/flow';

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
    ...overrides,
  };
}

describe('EditorStateHolder', () => {
  let service: EditorStateHolder;
  let confirmSpy: jasmine.SpyObj<ConfirmDialogService>;
  let authSpy: jasmine.SpyObj<Authorization>;
  let flowsServiceSpy: jasmine.SpyObj<FlowsService>;

  beforeEach(() => {
    confirmSpy = jasmine.createSpyObj('ConfirmDialogService', ['open']);
    authSpy = jasmine.createSpyObj('Authorization', ['loggedInUser']);
    authSpy.loggedInUser = jasmine.createSpy().and.returnValue({ username: 'testuser', email: null, role: 'USER' }) as any;
    flowsServiceSpy = jasmine.createSpyObj('FlowsService', ['getFlowValidation']);

    TestBed.configureTestingModule({
      providers: [
        EditorStateHolder,
        { provide: ConfirmDialogService, useValue: confirmSpy },
        { provide: Authorization, useValue: authSpy },
      ],
    });
    service = TestBed.inject(EditorStateHolder);
    service.flowsService = flowsServiceSpy as any;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have no flow initially', () => {
    expect(service.hasFlow()).toBeFalse();
    expect(service.currentFlow()).toBeNull();
  });

  describe('openDocument', () => {
    it('should set the current flow', async () => {
      const flow = makeFlow();
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(flow);
      expect(service.currentFlow()).toEqual(flow);
      expect(service.hasFlow()).toBeTrue();
      expect(service.isDirty()).toBeFalse();
    });

    it('should prompt confirmation when dirty', async () => {
      const flow1 = makeFlow({ id: 'f1' });
      const flow2 = makeFlow({ id: 'f2' });
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(flow1);
      service.updateData({ blocks: [{ id: 'b1', name: 'B1', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'LLMBlock' }], containers: [], connections: [], dependencies: [] });
      expect(service.isDirty()).toBeTrue();

      confirmSpy.open.and.returnValue(Promise.resolve(false));
      const result = await service.openDocument(flow2);
      expect(result).toBeFalse();
      expect(service.currentFlow()!.id).toBe('f1');
    });

    it('should skip dirty check when option is set', async () => {
      const flow1 = makeFlow({ id: 'f1' });
      const flow2 = makeFlow({ id: 'f2' });
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(flow1);
      service.updateData({ blocks: [{ id: 'b1', name: 'B1', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'LLMBlock' }], containers: [], connections: [], dependencies: [] });

      const result = await service.openDocument(flow2, { skipDirtyCheck: true });
      expect(result).toBeTrue();
      expect(service.currentFlow()!.id).toBe('f2');
    });
  });

  describe('closeDocument', () => {
    it('should clear the current flow', async () => {
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(makeFlow());
      service.closeDocument();
      expect(service.currentFlow()).toBeNull();
      expect(service.hasFlow()).toBeFalse();
      expect(service.isDirty()).toBeFalse();
    });
  });

  describe('updateData', () => {
    it('should mark editor as dirty', async () => {
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(makeFlow());
      const newData: FlowData = { blocks: [{ id: 'b1', name: 'Block1', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'LLMBlock' }], containers: [], connections: [], dependencies: [] };
      service.updateData(newData);
      expect(service.isDirty()).toBeTrue();
    });

    it('should not mark dirty if data unchanged', async () => {
      const flow = makeFlow();
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(flow);
      service.updateData({ ...flow.data });
      expect(service.isDirty()).toBeFalse();
    });
  });

  describe('isCurrentFlowReadOnly', () => {
    it('should return true for finalized flow', async () => {
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(makeFlow({ finalized: true }));
      expect(service.isCurrentFlowReadOnly()).toBeTrue();
    });

    it('should return true for public flow by another author', async () => {
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(makeFlow({ visibility: 'PUBLIC', author: 'otheruser' }));
      expect(service.isCurrentFlowReadOnly()).toBeTrue();
    });

    it('should return false for own private flow', async () => {
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(makeFlow({ visibility: 'PRIVATE', author: 'testuser' }));
      expect(service.isCurrentFlowReadOnly()).toBeFalse();
    });
  });

  describe('block selection', () => {
    it('should set and clear selected blocks', () => {
      service.setSelectedBlocks(['b1', 'b2']);
      expect(service.selectedBlockIds()).toEqual(['b1', 'b2']);
      expect(service.isBlockSelected('b1')).toBeTrue();
      expect(service.isBlockSelected('b3')).toBeFalse();

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
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(makeFlow({ name: 'Old Title' }));
      service.updateFlowTitle('New Title');
      expect(service.currentFlow()!.name).toBe('New Title');
      expect(service.isDirty()).toBeTrue();
    });

    it('should not mark dirty if title unchanged', async () => {
      flowsServiceSpy.getFlowValidation.and.returnValue({ subscribe: () => {} } as any);
      await service.openDocument(makeFlow({ name: 'Same' }));
      service.updateFlowTitle('Same');
      expect(service.isDirty()).toBeFalse();
    });
  });
});
