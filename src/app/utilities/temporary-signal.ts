import { WritableSignal } from '@angular/core';

/**
 * Clears `target` back to `null` after `delayMs`. Used for transient
 * success/error banners that should auto-dismiss.
 */
export function scheduleSignalClear<T>(target: WritableSignal<T | null>, delayMs = 3000): void {
  setTimeout(() => target.set(null), delayMs);
}
