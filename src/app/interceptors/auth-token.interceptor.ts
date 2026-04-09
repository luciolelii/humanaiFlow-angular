import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '@services/notifications/notification';
import { catchError, throwError } from 'rxjs';

export const withCredentialsInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
};

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const notification = inject(NotificationService);
  const requestPath = req.url.split('?')[0];
  const isAuthEndpoint =
    requestPath.endsWith('/auth/login') ||
    requestPath.endsWith('/auth/register');

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        !isAuthEndpoint &&
        error instanceof HttpErrorResponse &&
        error.status === 401
      ) {
        notification.show('Session expired. Redirecting to login.', 'warning');
        redirectToLogin(router);
      }

      if (
        error instanceof HttpErrorResponse &&
        (error.status === 0 || error.status >= 500)
      ) {
        notification.show('Error contacting service, please retry later.', 'error');
      }

      return throwError(() => error);
    })
  );
};

function redirectToLogin(router: Router) {
  if (router.url === '/login') return;
  void router.navigateByUrl('/login');
}
