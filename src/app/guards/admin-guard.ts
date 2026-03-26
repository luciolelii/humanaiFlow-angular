import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';

export const adminGuard: CanActivateFn = () => {
  const authorization = inject(Authorization);
  const router = inject(Router);

  if (authorization.isAdmin()) {
    return true;
  }

  router.navigate(['/']);
  return false;
};
