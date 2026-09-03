import { Injectable, signal } from '@angular/core';

/**
 * Announces that a bias impact report has just come into existence.
 *
 * The experiment and compare dialogs are global hosts rendered over the execution aside, which
 * stays mounted underneath. Without this, running an experiment left the Bias impact tab still
 * saying there were no reports, and the only way to see the new one was to leave the tab and come
 * back.
 *
 * The dialogs notify rather than the viewer, because they are what knows a report was actually
 * produced: an experiment that failed produced none.
 */
@Injectable({ providedIn: 'root' })
export class BiasReportsRevisionService {
  private readonly _revision = signal(0);
  readonly revision = this._revision.asReadonly();

  reportProduced() {
    this._revision.update((current) => current + 1);
  }
}
