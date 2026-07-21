import { CanActivateFn } from '@angular/router';
import { createSessionGuard } from './session-guard';

export const authGuard: CanActivateFn = createSessionGuard(
  (user) => !!user,
  '/login',
  'authGuard',
  'user not logged in'
);
