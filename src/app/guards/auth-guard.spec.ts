import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { firstValueFrom, Observable, of } from 'rxjs';
import { vi } from 'vitest';
import { authGuard } from './auth-guard';

describe('authGuard', () => {
  let authorizationSpy: { validateSession: ReturnType<typeof vi.fn> };
  let routerSpy: { parseUrl: ReturnType<typeof vi.fn> };

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = {} as RouterStateSnapshot;

  beforeEach(() => {
    authorizationSpy = {
      validateSession: vi.fn()
    };
    routerSpy = {
      parseUrl: vi.fn().mockReturnValue({} as UrlTree)
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Authorization, useValue: authorizationSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });
  });

  it('should allow access when logged in', async () => {
    authorizationSpy.validateSession.mockReturnValue(of({
      username: 'testuser',
      email: 'test@example.com',
      role: 'USER'
    }));

    const result = await firstValueFrom(executeGuard(dummyRoute, dummyState) as Observable<boolean | UrlTree>);

    expect(result).toBe(true);
    expect(routerSpy.parseUrl).not.toHaveBeenCalled();
  });

  it('should deny access and redirect to /login when not logged in', async () => {
    const loginUrlTree = {} as UrlTree;
    authorizationSpy.validateSession.mockReturnValue(of(null));
    routerSpy.parseUrl.mockReturnValue(loginUrlTree);

    const result = await firstValueFrom(executeGuard(dummyRoute, dummyState) as Observable<boolean | UrlTree>);

    expect(result).toBe(loginUrlTree);
    expect(routerSpy.parseUrl).toHaveBeenCalledWith('/login');
  });
});
