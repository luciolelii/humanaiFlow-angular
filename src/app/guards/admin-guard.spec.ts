import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { adminGuard } from './admin-guard';
import { firstValueFrom, Observable, of } from 'rxjs';

describe('adminGuard', () => {
  let authorizationSpy: jasmine.SpyObj<Authorization>;
  let routerSpy: jasmine.SpyObj<Router>;

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => adminGuard(...guardParameters));

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

  it('should allow access when user is admin', async () => {
    authorizationSpy.validateSession.and.returnValue(of({
      username: 'adminuser',
      email: 'admin@example.com',
      role: 'ADMIN'
    }));
    const result = await firstValueFrom(executeGuard(dummyRoute, dummyState) as Observable<boolean | UrlTree>);
    expect(result).toBeTrue();
    expect(routerSpy.parseUrl).not.toHaveBeenCalled();
  });

  it('should deny access and redirect to / when user is not admin', async () => {
    const homeUrlTree = {} as UrlTree;
    authorizationSpy.validateSession.and.returnValue(of({
      username: 'testuser',
      email: 'test@example.com',
      role: 'USER'
    }));
    routerSpy.parseUrl.and.returnValue(homeUrlTree);
    const result = await firstValueFrom(executeGuard(dummyRoute, dummyState) as Observable<boolean | UrlTree>);
    expect(result).toBe(homeUrlTree);
    expect(routerSpy.parseUrl).toHaveBeenCalledWith('/');
  });
});
