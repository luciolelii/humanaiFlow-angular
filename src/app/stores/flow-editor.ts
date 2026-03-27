import { computed, inject, Injectable, signal } from '@angular/core';
import { Flow, FlowData, FlowValidationError, normalizeFlowValidationErrors } from '@models/flow';
import { Authorization } from '@services/authorization/authorization';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { FlowsService } from '@services/flows/flows';
import { catchError, of, switchMap, take, tap, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EditorStateHolder {
  static readonly ASSISTANT_DRAFT_PREFIX = 'assistant-draft:';
  private lastValidationFetchKey: string | null = null;

  /** Stato */
  readonly currentFlow = signal<Flow | null>(null);
  readonly isDirty = signal(false);
  readonly selectedBlockIds = signal<string[]>([]);
  readonly draggingSelectedBlockIds = signal<string[]>([]);
  readonly flowValidationErrors = signal<FlowValidationError[]>([]);
  readonly highlightedValidationNodeIds = signal<string[]>([]);
  readonly validationRequiresSave = signal(false);

  /** Derived state */
  readonly hasFlow = computed(() => !!this.currentFlow());
  readonly isCurrentFlowReadOnly = computed(() => {
    const flow = this.currentFlow();
    const currentUsername = this.authorization.loggedInUser()?.username ?? null;
    if (!flow) return false;
    if (flow.finalized) return true;
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
    this.validationRequiresSave.set(false);
    this.applyFlowValidationErrors(doc.validationErrors ?? []);
    this.ensureValidationForFlow(doc);
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
    this.validationRequiresSave.set(false);
    this.applyFlowValidationErrors([]);
    this.lastValidationFetchKey = null;
    this.clearBlockSelection();
  }

  loadAssistantFlow(flow: Flow, options?: { markDirty?: boolean }) {
    if (this.isCurrentFlowReadOnly()) return;
    this.currentFlow.set(flow);
    this.isDirty.set(options?.markDirty === true);
    this.validationRequiresSave.set(options?.markDirty === true);
    this.applyFlowValidationErrors(flow.validationErrors ?? []);
    this.ensureValidationForFlow(flow);
    this.clearBlockSelection();
  }

  updateData(data: FlowData, options?: { structural?: boolean }) {
    if (this.isCurrentFlowReadOnly()) return;
    const current = this.currentFlow();
    if (!current) return;
    if (this.areFlowDataEqual(current.data, data)) return;

    const nextFlow = { ...current, data };
    this.currentFlow.set(nextFlow);
    this.markDirty();
    if (options?.structural !== false) {
      this.validationRequiresSave.set(true);
    }
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
      return throwError(() => new Error('Read-only flows cannot be saved.'));
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
      switchMap((savedFlow) => {
        const validation$ = savedFlow.status !== 'EXECUTABLE'
          ? this.flowsService.getFlowValidation(savedFlow.id)
          : of([]);

        return validation$.pipe(
          tap((validationErrors) => {
            const nextFlow = {
              ...savedFlow,
              validationErrors
            };
            this.currentFlow.set(nextFlow);
            this.lastValidationFetchKey = this.validationFetchKey(nextFlow);
            this.applyFlowValidationErrors(validationErrors);
            this.markSaved();
            this.validationRequiresSave.set(false);
          }),
          switchMap(() => of({
            ...savedFlow,
            validationErrors: this.flowValidationErrors()
          }))
        );
      }),
      catchError((error) => {
        this.applyFlowValidationErrors(this.extractValidationErrors(error));
        return throwError(() => error);
      })
    )
  }

  setHighlightedValidationNodes(nodeIds: string[]) {
    const unique = Array.from(new Set((nodeIds ?? []).filter((id) => typeof id === 'string' && id.length > 0)));
    this.highlightedValidationNodeIds.set(unique);
  }

  isValidationNodeHighlighted(blockId: string | null | undefined): boolean {
    if (!blockId) return false;
    return this.highlightedValidationNodeIds().includes(blockId);
  }

  private areFlowDataEqual(left: FlowData, right: FlowData): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private applyFlowValidationErrors(errors: FlowValidationError[]) {
    const normalized = Array.isArray(errors) ? errors : [];
    this.flowValidationErrors.set(normalized);
    this.highlightedValidationNodeIds.set(Array.from(new Set(
      normalized.flatMap((error) => Array.isArray(error.relatedNodeIds) ? error.relatedNodeIds : [])
    )));
  }

  private extractValidationErrors(error: unknown): FlowValidationError[] {
    const candidate = (error as any)?.error?.errors
      ?? (error as any)?.errors
      ?? (error as any)?.error?.validationErrors
      ?? (error as any)?.validationErrors
      ?? [];

    return normalizeFlowValidationErrors(candidate);
  }

  private ensureValidationForFlow(flow: Flow | null) {
    if (!flow) return;
    if (flow.status === 'EXECUTABLE') {
      this.lastValidationFetchKey = this.validationFetchKey(flow);
      return;
    }

    const fetchKey = this.validationFetchKey(flow);
    if (this.lastValidationFetchKey === fetchKey) return;
    this.lastValidationFetchKey = fetchKey;

    this.flowsService.getFlowValidation(flow.id).pipe(take(1)).subscribe({
      next: (validationErrors) => {
        const current = this.currentFlow();
        if (!current || current.id !== flow.id) return;
        this.currentFlow.set({
          ...current,
          validationErrors
        });
        this.applyFlowValidationErrors(validationErrors);
      },
      error: (error) => {
        console.error('Retrieve flow validation failed', error);
      }
    });
  }

  private validationFetchKey(flow: Flow): string {
    return `${flow.id}:${flow.status}:${flow.updatedAt?.toISOString?.() ?? ''}`;
  }
}
