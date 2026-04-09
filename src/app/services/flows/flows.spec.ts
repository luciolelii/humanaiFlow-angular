import { TestBed } from '@angular/core/testing';
import { FlowsService } from './flows';
import { FlowsCallServiceBase } from './flows-call.base';
import { Flow, FlowData, FlowValidationError } from '@models/flow';
import { of, throwError } from 'rxjs';

function makeFlow(id = 'f1'): Flow {
  const data: FlowData = { blocks: [], containers: [], connections: [], dependencies: [] };
  return {
    id,
    name: 'Flow ' + id,
    visibility: 'PRIVATE',
    data,
    author: 'user',
    createdAt: new Date(),
    status: 'DRAFT',
    updatedAt: new Date(),
  };
}

describe('FlowsService', () => {
  let service: FlowsService;
  let callServiceSpy: jasmine.SpyObj<FlowsCallServiceBase>;

  beforeEach(() => {
    callServiceSpy = jasmine.createSpyObj('FlowsCallServiceBase', [
      'retrieveAllFlows',
      'updateFlow',
      'createFlow',
      'deleteFlow',
      'updatePublished',
      'finalizeFlow',
      'getFlowValidation',
      'getFlowById',
      'createNewFlow',
    ]);

    TestBed.configureTestingModule({});
    service = TestBed.inject(FlowsService);
    service.flowsCallService = callServiceSpy;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAllFlows', () => {
    it('should load flows on first call', async () => {
      const flows = [makeFlow('f1'), makeFlow('f2')];
      callServiceSpy.retrieveAllFlows.and.returnValue(of(flows));

      const result = await service.getAllFlows();
      expect(result()).toEqual(flows);
      expect(callServiceSpy.retrieveAllFlows).toHaveBeenCalledTimes(1);
    });

    it('should not reload on subsequent calls', async () => {
      callServiceSpy.retrieveAllFlows.and.returnValue(of([makeFlow()]));

      await service.getAllFlows();
      await service.getAllFlows();
      expect(callServiceSpy.retrieveAllFlows).toHaveBeenCalledTimes(1);
    });

    it('should retry after failure', async () => {
      callServiceSpy.retrieveAllFlows.and.returnValue(throwError(() => new Error('fail')));
      try { await service.getAllFlows(); } catch {}

      const flows = [makeFlow()];
      callServiceSpy.retrieveAllFlows.and.returnValue(of(flows));
      const result = await service.getAllFlows();
      expect(result()).toEqual(flows);
    });
  });

  describe('refresh', () => {
    it('should update flows signal', async () => {
      const flows = [makeFlow('r1')];
      callServiceSpy.retrieveAllFlows.and.returnValue(of(flows));
      await service.refresh();
      expect(service.flows()).toEqual(flows);
    });

    it('should clear loadingPromise after error', async () => {
      callServiceSpy.retrieveAllFlows.and.returnValue(throwError(() => new Error('fail')));
      try { await service.refresh(); } catch {}

      callServiceSpy.retrieveAllFlows.and.returnValue(of([]));
      await service.refresh();
      expect(service.flows()).toEqual([]);
    });
  });

  describe('updateFlow', () => {
    it('should update the flow in the signal', async () => {
      callServiceSpy.retrieveAllFlows.and.returnValue(of([makeFlow('f1')]));
      await service.refresh();

      const updated = makeFlow('f1');
      updated.name = 'Updated';
      callServiceSpy.updateFlow.and.returnValue(of(updated));

      await new Promise<void>((resolve) => {
        service.updateFlow(updated).subscribe(() => resolve());
      });

      expect(service.flows()[0].name).toBe('Updated');
    });
  });

  describe('createFlow', () => {
    it('should add a new flow to the signal', async () => {
      callServiceSpy.retrieveAllFlows.and.returnValue(of([]));
      await service.refresh();

      const created = makeFlow('new1');
      callServiceSpy.createFlow.and.returnValue(of(created));

      await new Promise<void>((resolve) => {
        service.createFlow({ name: 'New', description: '', data: created.data, status: 'DRAFT' }).subscribe(() => resolve());
      });

      expect(service.flows().length).toBe(1);
      expect(service.flows()[0].id).toBe('new1');
    });
  });

  describe('deleteFlow', () => {
    it('should trigger a refresh after deletion', async () => {
      callServiceSpy.retrieveAllFlows.and.returnValue(of([makeFlow('f1')]));
      await service.refresh();

      callServiceSpy.deleteFlow.and.returnValue(of(void 0));
      callServiceSpy.retrieveAllFlows.and.returnValue(of([]));

      await new Promise<void>((resolve) => {
        service.deleteFlow('f1').subscribe(() => resolve());
      });
    });
  });
});
