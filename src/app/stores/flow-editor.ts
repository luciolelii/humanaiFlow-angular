import { computed, inject, Injectable, signal } from '@angular/core';
import { Flow, FlowData } from '@models/flow';
import { Authorization } from '@services/authorization/authorization';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { FlowsService } from '@services/flows/flows';
import { tap, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EditorStateHolder {
  static readonly ASSISTANT_DRAFT_PREFIX = 'assistant-draft:';

  /** Stato */
  readonly currentFlow = signal<Flow | null>(null);
  readonly isDirty = signal(false);
  readonly selectedBlockIds = signal<string[]>([]);
  readonly draggingSelectedBlockIds = signal<string[]>([]);

  /** Derived state */
  readonly hasFlow = computed(() => !!this.currentFlow());
  readonly isCurrentFlowReadOnly = computed(() => {
    const flow = this.currentFlow();
    const currentUsername = this.authorization.loggedInUser()?.username ?? null;
    if (!flow) return false;
    return flow.visibility === 'PUBLIC' && flow.author !== currentUsername;
  });

  flowsService: FlowsService = inject(FlowsService);

  constructor(
    private confirm: ConfirmDialogService,
    private authorization: Authorization
  ) { }

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
    this.clearBlockSelection();
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
    this.clearBlockSelection();
  }

  loadAssistantFlow(flow: Flow, options?: { markDirty?: boolean }) {
    if (this.isCurrentFlowReadOnly()) return;
    this.currentFlow.set(flow);
    this.isDirty.set(options?.markDirty === true);
    this.clearBlockSelection();
  }

  updateData(data: FlowData) {
    if (this.isCurrentFlowReadOnly()) return;
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

  setSelectedBlocks(blockIds: string[]) {
    const unique = Array.from(new Set(blockIds.filter((id) => typeof id === 'string' && id.length > 0)));
    this.selectedBlockIds.set(unique);
  }

  clearBlockSelection() {
    this.selectedBlockIds.set([]);
    this.draggingSelectedBlockIds.set([]);
  }

  isBlockSelected(blockId: string | null | undefined): boolean {
    if (!blockId) return false;
    return this.selectedBlockIds().includes(blockId);
  }

  startDraggingSelectedBlocks(blockIds?: string[]) {
    const nextIds = blockIds?.length ? blockIds : this.selectedBlockIds();
    this.draggingSelectedBlockIds.set(Array.from(new Set(nextIds)));
  }

  stopDraggingSelectedBlocks() {
    this.draggingSelectedBlockIds.set([]);
  }
  
  updateFlowTitle(newTitle: string) {
    if (this.isCurrentFlowReadOnly()) return;
    const current = this.currentFlow();
    if (!current) return;
    if (current.name === newTitle) return;

    const nextFlow = { ...current, name: newTitle };
    this.currentFlow.set(nextFlow);
    this.markDirty();
  }

  save() {
    if (this.isCurrentFlowReadOnly()) {
      return throwError(() => new Error('Read-only public flows cannot be saved by non-owners.'));
    }
    const flow = this.currentFlow()!;
    const save$ = flow.id.startsWith(EditorStateHolder.ASSISTANT_DRAFT_PREFIX)
      ? this.flowsService.createFlow({
        name: flow.name,
        description: flow.description,
        data: flow.data,
        status: flow.status
      })
      : this.flowsService.updateFlow(flow);

    return save$.pipe(
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
