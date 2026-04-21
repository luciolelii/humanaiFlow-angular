import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { firstValueFrom, Observable, of } from 'rxjs';
import { vi } from 'vitest';
import { adminGuard } from './admin-guard';

describe('adminGuard', () => {
  let authorizationSpy: { validateSession: ReturnType<typeof vi.fn> };
  let routerSpy: { parseUrl: ReturnType<typeof vi.fn> };

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => adminGuard(...guardParameters));

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

  it('should allow access when user is admin', async () => {
    authorizationSpy.validateSession.mockReturnValue(of({
      username: 'adminuser',
      email: 'admin@example.com',
      role: 'ADMIN'
    }));

    const result = await firstValueFrom(executeGuard(dummyRoute, dummyState) as Observable<boolean | UrlTree>);

    expect(result).toBe(true);
    expect(routerSpy.parseUrl).not.toHaveBeenCalled();
  });

  it('should deny access and redirect to / when user is not admin', async () => {
    const homeUrlTree = {} as UrlTree;
    authorizationSpy.validateSession.mockReturnValue(of({
      username: 'testuser',
      email: 'test@example.com',
      role: 'USER'
    }));
    routerSpy.parseUrl.mockReturnValue(homeUrlTree);

    const result = await firstValueFrom(executeGuard(dummyRoute, dummyState) as Observable<boolean | UrlTree>);

    expect(result).toBe(homeUrlTree);
    expect(routerSpy.parseUrl).toHaveBeenCalledWith('/');
  });
});
