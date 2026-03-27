import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GraphSelectionService {
  readonly selectedConnectionId = signal<string | null>(null);
  readonly deleteConnectionRequestTick = signal(0);

  selectConnection(connectionId: string | null | undefined) {
    this.selectedConnectionId.set(connectionId ? String(connectionId) : null);
  }

  clearConnectionSelection() {
    this.selectedConnectionId.set(null);
  }

  requestDeleteSelectedConnection() {
    if (!this.selectedConnectionId()) return;
    this.deleteConnectionRequestTick.update((value) => value + 1);
  }
}
