import { computed, inject, Injectable, signal } from '@angular/core';
import { Flow } from '@models/flow';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { FlowsService } from '@services/flows/flows';
import { FlowsCallService } from '@services/flows/flows-call';
import { tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EditorStateHolder {

  /** Stato */
  readonly currentFlow = signal<Flow | null>(null);
  readonly isDirty = signal(false);

  /** Derived state */
  readonly hasFlow = computed(() => !!this.currentFlow());

  flowsService: FlowsService = inject(FlowsService);

  constructor(private confirm: ConfirmDialogService) { }


  /** Intent: open document */
  async openDocument(doc: Flow): Promise<boolean> {
    if (this.isDirty()) {
      const confirmed = await this.confirm.open(
        'You have unsaved changes. Open another document?'
      );

      if (!confirmed) return false;
    }

    this.currentFlow.set(doc);
    this.isDirty.set(false);
    return true;
  }

  /** Intent: mark editor dirty */
  private markDirty() {
    this.isDirty.set(true);
  }

  /** Intent: save document */
  private markSaved() {
    this.isDirty.set(false);
  }

  /** Intent: close document */
  closeDocument() {
    this.currentFlow.set(null);
    this.isDirty.set(false);
  }

  updateFlow(updated: Flow) {
    this.currentFlow.set(updated);
    this.markDirty();
  }

  save() {
    return this.flowsService.updateFlow(this.currentFlow()!).pipe(
      tap(() =>  this.markSaved())
    )
  }
}
