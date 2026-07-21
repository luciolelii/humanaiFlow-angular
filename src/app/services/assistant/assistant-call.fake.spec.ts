import { catchError, of } from 'rxjs';
import { AssistantCallServiceFake } from './assistant-call.fake';

describe('AssistantCallServiceFake', () => {
  let service: AssistantCallServiceFake;

  beforeEach(() => {
    service = new AssistantCallServiceFake();
  });

  it('surfaces "call not found" as an observable error catchError can intercept, not a synchronous throw', async () => {
    expect(() => service.getCall('missing-call')).not.toThrow();

    let caught: unknown = null;
    await new Promise<void>((resolve) => {
      service.getCall('missing-call').pipe(
        catchError((error) => {
          caught = error;
          return of(null);
        })
      ).subscribe(() => resolve());
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('missing-call');
  });

  it('surfaces "session not found" as an observable error catchError can intercept, not a synchronous throw', async () => {
    expect(() => service.getSession('missing-session')).not.toThrow();

    let caught: unknown = null;
    await new Promise<void>((resolve) => {
      service.getSession('missing-session').pipe(
        catchError((error) => {
          caught = error;
          return of(null);
        })
      ).subscribe(() => resolve());
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('missing-session');
  });
});
