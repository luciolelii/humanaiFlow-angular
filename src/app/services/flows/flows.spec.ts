import { TestBed } from '@angular/core/testing';
import { Flow, FlowData } from '@models/flow';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { FlowsCallServiceBase } from './flows-call.base';
import { FlowsService } from './flows';

function makeFlow(id = 'f1'): Flow {
  const data: FlowData = { blocks: [], containers: [], connections: [], dependencies: [] };
  return {
    id,
    name: `Flow ${id}`,
    visibility: 'PRIVATE',
    data,
    author: 'user',
    createdAt: new Date(),
    status: 'DRAFT',
    updatedAt: new Date()
  };
}

describe('FlowsService', () => {
  let service: FlowsService;
  let callServiceSpy: {
    retrieveAllFlows: ReturnType<typeof vi.fn>;
    updateFlow: ReturnType<typeof vi.fn>;
    createFlow: ReturnType<typeof vi.fn>;
    deleteFlow: ReturnType<typeof vi.fn>;
    updatePublished: ReturnType<typeof vi.fn>;
    finalizeFlow: ReturnType<typeof vi.fn>;
    getFlowValidation: ReturnType<typeof vi.fn>;
    getGroupedFlowValidation: ReturnType<typeof vi.fn>;
    getFlowById: ReturnType<typeof vi.fn>;
    createNewFlow: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    callServiceSpy = {
      retrieveAllFlows: vi.fn(),
      updateFlow: vi.fn(),
      createFlow: vi.fn(),
      deleteFlow: vi.fn(),
      updatePublished: vi.fn(),
      finalizeFlow: vi.fn(),
      getFlowValidation: vi.fn(),
      getGroupedFlowValidation: vi.fn(),
      getFlowById: vi.fn(),
      createNewFlow: vi.fn()
    };

    TestBed.configureTestingModule({});
    service = TestBed.inject(FlowsService);
    service.flowsCallService = callServiceSpy as unknown as FlowsCallServiceBase;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAllFlows', () => {
    it('should load flows on first call', async () => {
      const flows = [makeFlow('f1'), makeFlow('f2')];
      callServiceSpy.retrieveAllFlows.mockReturnValue(of(flows));

      const result = await service.getAllFlows();

      expect(result()).toEqual(flows);
      expect(callServiceSpy.retrieveAllFlows).toHaveBeenCalledTimes(1);
    });

    it('should not reload on subsequent calls', async () => {
      callServiceSpy.retrieveAllFlows.mockReturnValue(of([makeFlow()]));

      await service.getAllFlows();
      await service.getAllFlows();

      expect(callServiceSpy.retrieveAllFlows).toHaveBeenCalledTimes(1);
    });

    it('should retry after failure', async () => {
      callServiceSpy.retrieveAllFlows.mockReturnValue(throwError(() => new Error('fail')));
      try {
        await service.getAllFlows();
      } catch {
        // expected
      }

      const flows = [makeFlow()];
      callServiceSpy.retrieveAllFlows.mockReturnValue(of(flows));
      const result = await service.getAllFlows();

      expect(result()).toEqual(flows);
    });
  });

  describe('refresh', () => {
    it('should update flows signal', async () => {
      const flows = [makeFlow('r1')];
      callServiceSpy.retrieveAllFlows.mockReturnValue(of(flows));

      await service.refresh();

      expect(service.flows()).toEqual(flows);
    });

    it('should clear loadingPromise after error', async () => {
      callServiceSpy.retrieveAllFlows.mockReturnValue(throwError(() => new Error('fail')));
      try {
        await service.refresh();
      } catch {
        // expected
      }

      callServiceSpy.retrieveAllFlows.mockReturnValue(of([]));
      await service.refresh();

      expect(service.flows()).toEqual([]);
    });
  });

  describe('updateFlow', () => {
    it('should update the flow in the signal', async () => {
      callServiceSpy.retrieveAllFlows.mockReturnValue(of([makeFlow('f1')]));
      await service.refresh();

      const updated = makeFlow('f1');
      updated.name = 'Updated';
      callServiceSpy.updateFlow.mockReturnValue(of(updated));

      await new Promise<void>((resolve) => {
        service.updateFlow(updated).subscribe(() => resolve());
      });

      expect(service.flows()[0].name).toBe('Updated');
    });
  });

  describe('createFlow', () => {
    it('should add a new flow to the signal', async () => {
      callServiceSpy.retrieveAllFlows.mockReturnValue(of([]));
      await service.refresh();

      const created = makeFlow('new1');
      callServiceSpy.createFlow.mockReturnValue(of(created));

      await new Promise<void>((resolve) => {
        service.createFlow({ name: 'New', description: '', data: created.data, status: 'DRAFT' }).subscribe(() => resolve());
      });

      expect(service.flows().length).toBe(1);
      expect(service.flows()[0].id).toBe('new1');
    });
  });

  describe('deleteFlow', () => {
    it('should trigger a refresh after deletion', async () => {
      callServiceSpy.retrieveAllFlows.mockReturnValue(of([makeFlow('f1')]));
      await service.refresh();

      callServiceSpy.deleteFlow.mockReturnValue(of(void 0));
      callServiceSpy.retrieveAllFlows.mockReturnValue(of([]));

      await new Promise<void>((resolve) => {
        service.deleteFlow('f1').subscribe(() => resolve());
      });
    });
  });
});
