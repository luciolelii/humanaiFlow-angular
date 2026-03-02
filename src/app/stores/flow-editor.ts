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


  previousDataStack : FlowData[] = [];
  nextDataStack : FlowData[] = [];
  
  redoEnabled = computed(() => this.nextDataStack.length > 0);
  undoEnabled = computed(() => this.previousDataStack.length > 1);

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
    this.currentFlow.update(flow => {
      if (!flow) return flow;
      return { ...flow, data };
    });
    this.previousDataStack.push(data);
    this.markDirty();
  }
  
  updateFlowTitle(newTitle: string) {
    const flow = this.currentFlow();
    if (!flow) return;
    this.currentFlow.update(flow => {
      if (!flow) return flow;
      return { ...flow, name: newTitle };
    });
    this.previousDataStack.push(flow.data);
    this.markDirty();
  }

  save() {
    return this.flowsService.updateFlow(this.currentFlow()!).pipe(
      tap(() =>  this.markSaved())
    )
  }

  undo() {
    const stack = this.previousDataStack;
    if (stack.length < 2) return; // Nothing to undo

    // Remove the current state
    this.nextDataStack.push(stack.pop()!);
    // Get the previous state
    const previousData = stack[stack.length - 1];
    this.updateData(previousData);
  }

  redo() {
      const stack = this.nextDataStack;
      if (stack.length === 0) return; // Nothing to redo

      const nextData = stack.pop()!;
      this.previousDataStack.push(nextData);
      this.updateData(nextData);
  }

  
}
