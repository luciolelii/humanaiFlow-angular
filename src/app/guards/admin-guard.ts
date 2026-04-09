import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';

export const adminGuard: CanActivateFn = (_route, state) => {
  const authorization = inject(Authorization);
  const router = inject(Router);

  if (authorization.isAdmin()) {
    return true;
  }

  console.warn(`[adminGuard] Access denied to ${state.url} — user is not admin, redirecting to /`);
  router.navigate(['/']);
  return false;
};
