import { TestBed } from '@angular/core/testing';
import { catchError, of } from 'rxjs';
import { vi } from 'vitest';
import { Authorization } from '@services/authorization/authorization';
import { FlowsCallServiceFake } from './flows-call.fake';

describe('FlowsCallServiceFake', () => {
  let service: FlowsCallServiceFake;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Authorization, useValue: { loggedInUser: vi.fn().mockReturnValue({ username: 'Alice', email: null, role: 'USER' }) } }
      ]
    });
    service = TestBed.runInInjectionContext(() => new FlowsCallServiceFake());
  });

  it('surfaces "flow not found" as an observable error catchError can intercept, not a synchronous throw', async () => {
    let caught: unknown = null;
    await new Promise<void>((resolve) => {
      service.getFlowById('missing-flow').pipe(
        catchError((error) => {
          caught = error;
          return of(null);
        })
      ).subscribe(() => resolve());
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('missing-flow');
  });

  it('surfaces "flow is finalized" on updateFlow as an observable error, not a synchronous throw', async () => {
    const finalizedFlow = {
      id: '1', name: 'A Flow', data: { blocks: [], containers: [], connections: [], dependencies: [] },
      visibility: 'PUBLIC' as const, author: 'Alice', createdAt: new Date(), status: 'EXECUTABLE' as const,
      updatedAt: new Date(), finalized: true
    };

    expect(() => service.updateFlow(finalizedFlow)).not.toThrow();

    let caught: unknown = null;
    await new Promise<void>((resolve) => {
      service.updateFlow(finalizedFlow).pipe(
        catchError((error) => {
          caught = error;
          return of(null);
        })
      ).subscribe(() => resolve());
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('Flow is finalized');
  });
});
