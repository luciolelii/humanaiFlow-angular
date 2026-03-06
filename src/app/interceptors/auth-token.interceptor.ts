import { HttpInterceptorFn } from '@angular/common/http';
import { Authorization } from '@services/authorization/authorization';

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = getToken();
  if (!token) return next(req);

  const requestPath = req.url.split('?')[0];
  const isAuthEndpoint =
    requestPath.endsWith('/auth/login') ||
    requestPath.endsWith('/auth/register');
  if (isAuthEndpoint) {
    return next(req);
  }

  if (req.headers.has('Authorization')) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  );
};

function getToken(): string | null {
  const directToken = localStorage.getItem(Authorization.TOKEN_STORAGE_KEY);
  if (directToken) return directToken;

  const rawUser = localStorage.getItem(Authorization.USER_STORAGE_KEY);
  if (!rawUser) return null;

  try {
    const parsed = JSON.parse(rawUser) as { token?: unknown };
    return typeof parsed?.token === 'string' && parsed.token.length > 0 ? parsed.token : null;
  } catch {
    return null;
  }
}
