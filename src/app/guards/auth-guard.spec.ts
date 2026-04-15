import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { authGuard } from './auth-guard';
import { firstValueFrom, Observable, of } from 'rxjs';

describe('authGuard', () => {
  let authorizationSpy: jasmine.SpyObj<Authorization>;
  let routerSpy: jasmine.SpyObj<Router>;

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = {} as RouterStateSnapshot;

  beforeEach(() => {
    authorizationSpy = jasmine.createSpyObj('Authorization', ['validateSession']);
    routerSpy = jasmine.createSpyObj('Router', ['parseUrl']);
    routerSpy.parseUrl.and.returnValue({} as UrlTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: Authorization, useValue: authorizationSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  it('should allow access when logged in', async () => {
    authorizationSpy.validateSession.and.returnValue(of({
      username: 'testuser',
      email: 'test@example.com',
      role: 'USER'
    }));
    const result = await firstValueFrom(executeGuard(dummyRoute, dummyState) as Observable<boolean | UrlTree>);
    expect(result).toBeTrue();
    expect(routerSpy.parseUrl).not.toHaveBeenCalled();
  });

  it('should deny access and redirect to /login when not logged in', async () => {
    const loginUrlTree = {} as UrlTree;
    authorizationSpy.validateSession.and.returnValue(of(null));
    routerSpy.parseUrl.and.returnValue(loginUrlTree);
    const result = await firstValueFrom(executeGuard(dummyRoute, dummyState) as Observable<boolean | UrlTree>);
    expect(result).toBe(loginUrlTree);
    expect(routerSpy.parseUrl).toHaveBeenCalledWith('/login');
  });
});
