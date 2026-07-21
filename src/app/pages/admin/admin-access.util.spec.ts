import { Router } from '@angular/router';
import { vi } from 'vitest';
import { redirectOnAdminAccessDenied } from './admin-access.util';

describe('redirectOnAdminAccessDenied', () => {
  it('resets busy state and redirects to /editor on "Admin access required."', () => {
    const router = { navigateByUrl: vi.fn() } as unknown as Router;
    const onRedirect = vi.fn();

    const handled = redirectOnAdminAccessDenied(new Error('Admin access required.'), router, onRedirect);

    expect(handled).toBe(true);
    expect(onRedirect).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/editor');
  });

  it('leaves other errors untouched', () => {
    const router = { navigateByUrl: vi.fn() } as unknown as Router;
    const onRedirect = vi.fn();

    const handled = redirectOnAdminAccessDenied(new Error('Unable to create user.'), router, onRedirect);

    expect(handled).toBe(false);
    expect(onRedirect).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
