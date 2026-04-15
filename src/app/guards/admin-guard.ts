import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { map } from 'rxjs';

export const adminGuard: CanActivateFn = (_route, state) => {
  const authorization = inject(Authorization);
  const router = inject(Router);

  return authorization.validateSession().pipe(
    map((user) => {
      if (user?.role === 'ADMIN') {
        return true;
      }

      console.warn(`[adminGuard] Access denied to ${state.url} — user is not admin, redirecting to /`);
      return router.parseUrl('/');
    })
  );
};
