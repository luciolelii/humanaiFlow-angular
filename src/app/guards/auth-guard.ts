import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { map } from 'rxjs';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(Authorization);
  const router = inject(Router);

  return authService.validateSession().pipe(
    map((user) => {
      if (user) {
        return true;
      }

      console.warn(`[authGuard] Access denied to ${state.url} — user not logged in, redirecting to /login`);
      return router.parseUrl('/login');
    })
  );
};
