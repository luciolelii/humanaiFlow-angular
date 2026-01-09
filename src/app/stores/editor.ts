import { computed, Injectable, signal } from '@angular/core';
import { Flow } from '@models/flow';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';

@Injectable({ providedIn: 'root' })
export class EditorStateHolder {

  /** Stato */
  readonly currentFlow = signal<Flow | null>(null);
  readonly isDirty = signal(false);

  /** Derived state */
  readonly hasFlow = computed(() => !!this.currentFlow());

  constructor(private confirm: ConfirmDialogService) { }

  /** Intent: open document */
  async openDocument(doc: Flow): Promise<boolean> {
    const confirmed = await this.confirm.open(
      'You have unsaved changes. Open another document?'
    );

    if (!confirmed) return false;


    this.currentFlow.set(doc);
    this.isDirty.set(false);
    return true;
  }

  /** Intent: mark editor dirty */
  markDirty() {
    this.isDirty.set(true);
  }

  /** Intent: save document */
  markSaved() {
    this.isDirty.set(false);
  }

  /** Intent: close document */
  closeDocument() {
    this.currentFlow.set(null);
    this.isDirty.set(false);
  }
}
