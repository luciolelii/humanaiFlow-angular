import { computed, inject, Injectable, signal } from '@angular/core';
import { Flow, FlowData } from '@models/flow';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { FlowsService } from '@services/flows/flows';
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
  async openDocument(doc: Flow, options?: { skipDirtyCheck?: boolean }): Promise<boolean> {
    if (this.isDirty() && !options?.skipDirtyCheck) {
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

  updateData(data: FlowData) {
    const current = this.currentFlow();
    if (!current) return;
    if (this.areFlowDataEqual(current.data, data)) return;

    const nextFlow = { ...current, data };
    this.currentFlow.set(nextFlow);
    this.markDirty();
  }

  replaceDataWithoutDirty(data: FlowData) {
    const current = this.currentFlow();
    if (!current) return;
    if (this.areFlowDataEqual(current.data, data)) return;

    this.currentFlow.set({ ...current, data });
  }
  
  updateFlowTitle(newTitle: string) {
    const current = this.currentFlow();
    if (!current) return;
    if (current.name === newTitle) return;

    const nextFlow = { ...current, name: newTitle };
    this.currentFlow.set(nextFlow);
    this.markDirty();
  }

  save() {
    return this.flowsService.updateFlow(this.currentFlow()!).pipe(
      tap((savedFlow) => {
        this.currentFlow.set(savedFlow);
        this.markSaved();
      })
    )
  }

  private areFlowDataEqual(left: FlowData, right: FlowData): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}
