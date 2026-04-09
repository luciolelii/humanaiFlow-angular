import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { adminGuard } from './admin-guard';

describe('adminGuard', () => {
  let authorizationSpy: jasmine.SpyObj<Authorization>;
  let routerSpy: jasmine.SpyObj<Router>;

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => adminGuard(...guardParameters));

  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = {} as RouterStateSnapshot;

  beforeEach(() => {
    authorizationSpy = jasmine.createSpyObj('Authorization', ['isAdmin']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: Authorization, useValue: authorizationSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  it('should allow access when user is admin', () => {
    authorizationSpy.isAdmin.and.returnValue(true);
    const result = executeGuard(dummyRoute, dummyState);
    expect(result).toBeTrue();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('should deny access and redirect to / when user is not admin', () => {
    authorizationSpy.isAdmin.and.returnValue(false);
    const result = executeGuard(dummyRoute, dummyState);
    expect(result).toBeFalse();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
  });
});
