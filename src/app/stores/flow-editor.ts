import { computed, inject, Injectable, signal } from '@angular/core';
import {
  Flow,
  FlowData,
  FlowValidationError,
  GroupedFlowValidation,
  flattenGroupedFlowValidation,
  groupedFlowValidationFromErrors,
  normalizeFlowValidationErrors
} from '@models/flow';
import { Authorization } from '@services/authorization/authorization';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { FlowsService } from '@services/flows/flows';
import {
  FlowSubflowEntry,
  FlowSubflowLocatorStep,
  listFlowSubflows,
  replaceFlowSubflow,
  resolveFlowSubflow,
  subflowLocatorKey
} from '@utilities/flow-subflows';
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
  private readonly groupedFlowValidation = signal<GroupedFlowValidation>(emptyGroupedFlowValidation());
  private readonly localFlowValidationErrors = signal<FlowValidationError[]>([]);
  readonly flowValidationErrors = computed(() => {
    const validation = this.groupedFlowValidation();
    const activeSubflow = this.activeSubflow();
    if (!activeSubflow) {
      return [...validation.flowLevel, ...this.localFlowValidationErrors()];
    }

    const activeStep = activeSubflow.locator.at(-1);
    if (!activeStep) return [];
    const containerErrors = validation.byContainer[activeStep.containerId];
    if (!containerErrors) return [];
    return isGuardSubflow(activeStep.configurationPath)
      ? containerErrors.guard
      : containerErrors.body;
  });
  readonly highlightedValidationNodeIds = signal<string[]>([]);
  readonly validationRequiresSave = signal(false);
  readonly activeSubflow = signal<FlowSubflowEntry | null>(null);
  readonly structureNavigationRequest = signal(0);
  readonly isFullscreen = signal(false);

  /** Derived state */
  readonly hasFlow = computed(() => !!this.currentFlow());
  readonly availableSubflows = computed(() => {
    const flow = this.currentFlow();
    return flow ? listFlowSubflows(flow.data) : [];
  });
  readonly isEditingSubflow = computed(() => !!this.activeSubflow());
  readonly activeFlowData = computed(() => {
    const flow = this.currentFlow();
    const active = this.activeSubflow();
    if (!flow) return null;
    return active ? resolveFlowSubflow(flow.data, active.locator) ?? flow.data : flow.data;
  });
  readonly activeEditorKey = computed(() => {
    const flow = this.currentFlow();
    const active = this.activeSubflow();
    if (!flow) return '';
    return active ? `${flow.id}:subflow:${active.key}` : `${flow.id}:root`;
  });
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
    this.activeSubflow.set(null);
    this.isDirty.set(false);
    this.validationRequiresSave.set(false);
    this.applyGroupedFlowValidation(groupedFlowValidationFromErrors(doc.validationErrors), doc);
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
    this.activeSubflow.set(null);
    this.isDirty.set(false);
    this.validationRequiresSave.set(false);
    this.applyGroupedFlowValidation(emptyGroupedFlowValidation(), null);
    this.lastValidationFetchKey = null;
    this.clearBlockSelection();
    this.isFullscreen.set(false);
  }

  toggleFullscreen() {
    this.isFullscreen.update((fullscreen) => !fullscreen);
  }

  loadAssistantFlow(flow: Flow, options?: { markDirty?: boolean }) {
    if (this.isCurrentFlowReadOnly()) return;
    this.currentFlow.set(flow);
    this.activeSubflow.set(null);
    this.isDirty.set(options?.markDirty === true);
    this.validationRequiresSave.set(options?.markDirty === true);
    this.applyGroupedFlowValidation(groupedFlowValidationFromErrors(flow.validationErrors), flow);
    this.ensureValidationForFlow(flow);
    this.clearBlockSelection();
  }

  updateData(data: FlowData, options?: { structural?: boolean }) {
    if (this.isCurrentFlowReadOnly()) return;
    const current = this.currentFlow();
    if (!current) return;
    const active = this.activeSubflow();
    const currentData = active
      ? resolveFlowSubflow(current.data, active.locator)
      : current.data;
    if (!currentData || this.areFlowDataEqual(currentData, data)) return;

    const rootData = active
      ? replaceFlowSubflow(current.data, active.locator, data)
      : data;
    if (!rootData) return;
    const nextFlow = { ...current, data: rootData };
    this.currentFlow.set(nextFlow);
    this.markDirty();
    this.refreshValidationPresentation(nextFlow);
    if (options?.structural !== false) {
      this.validationRequiresSave.set(true);
    }
  }

  replaceDataWithoutDirty(data: FlowData) {
    const current = this.currentFlow();
    if (!current) return;
    const active = this.activeSubflow();
    const currentData = active
      ? resolveFlowSubflow(current.data, active.locator)
      : current.data;
    if (!currentData || this.areFlowDataEqual(currentData, data)) return;

    const rootData = active
      ? replaceFlowSubflow(current.data, active.locator, data)
      : data;
    if (!rootData) return;
    const nextFlow = { ...current, data: rootData };
    this.currentFlow.set(nextFlow);
    this.refreshValidationPresentation(nextFlow);
  }

  openRootFlow() {
    if (!this.currentFlow() || !this.activeSubflow()) return;
    this.activeSubflow.set(null);
    this.setHighlightedValidationNodes([]);
    this.clearBlockSelection();
  }

  openSubflow(locator: FlowSubflowLocatorStep[]): boolean {
    const flow = this.currentFlow();
    if (!flow || !resolveFlowSubflow(flow.data, locator)) return false;
    const key = subflowLocatorKey(locator);
    const entry = this.availableSubflows().find((candidate) => candidate.key === key);
    if (!entry) return false;
    this.activeSubflow.set(entry);
    this.setHighlightedValidationNodes([]);
    this.clearBlockSelection();
    return true;
  }

  openSubflowFromActiveContext(containerId: string, configurationPath: string): boolean {
    if (!containerId || !configurationPath) return false;
    const locator = [
      ...(this.activeSubflow()?.locator ?? []),
      { containerId, configurationPath }
    ];
    const opened = this.openSubflow(locator);
    if (opened) {
      this.structureNavigationRequest.update((value) => value + 1);
    }
    return opened;
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
    const flow = this.currentFlow();
    if (!flow) {
      return throwError(() => new Error('No flow is currently loaded.'));
    }
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
          ? this.flowsService.getGroupedFlowValidation(savedFlow.id)
          : of(emptyGroupedFlowValidation());

        return validation$.pipe(
          tap((validation) => {
            const validationErrors = flattenGroupedFlowValidation(validation);
            const nextFlow = {
              ...savedFlow,
              validationErrors
            };
            this.currentFlow.set(nextFlow);
            const active = this.activeSubflow();
            if (active && !resolveFlowSubflow(nextFlow.data, active.locator)) {
              this.activeSubflow.set(null);
            }
            this.lastValidationFetchKey = this.validationFetchKey(nextFlow);
            this.applyGroupedFlowValidation(validation, nextFlow);
            this.markSaved();
            this.validationRequiresSave.set(false);
          }),
          switchMap(() => of({
            ...savedFlow,
            validationErrors: this.currentFlow()?.validationErrors ?? []
          }))
        );
      }),
      catchError((error) => {
        this.applyGroupedFlowValidation(groupedFlowValidationFromErrors(this.extractValidationErrors(error)), this.currentFlow());
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

  private applyGroupedFlowValidation(validation: GroupedFlowValidation, flow?: Flow | null) {
    this.groupedFlowValidation.set(validation);
    this.refreshValidationPresentation(flow);
  }

  private refreshValidationPresentation(flow?: Flow | null) {
    this.localFlowValidationErrors.set(flow ? this.deriveGlobalInputReferenceErrors(flow) : []);
    const errors = this.flowValidationErrors();
    this.highlightedValidationNodeIds.set(Array.from(new Set(
      errors.flatMap((error) => Array.isArray(error.relatedNodeIds) ? error.relatedNodeIds : [])
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
    if (flow.id.startsWith(EditorStateHolder.ASSISTANT_DRAFT_PREFIX)) {
      this.lastValidationFetchKey = this.validationFetchKey(flow);
      this.applyGroupedFlowValidation(groupedFlowValidationFromErrors(flow.validationErrors), flow);
      return;
    }

    if (flow.status === 'EXECUTABLE') {
      this.lastValidationFetchKey = this.validationFetchKey(flow);
      this.applyGroupedFlowValidation(groupedFlowValidationFromErrors(flow.validationErrors), flow);
      return;
    }

    const fetchKey = this.validationFetchKey(flow);
    if (this.lastValidationFetchKey === fetchKey) return;
    this.lastValidationFetchKey = fetchKey;

    this.flowsService.getGroupedFlowValidation(flow.id).pipe(take(1)).subscribe({
      next: (validation) => {
        const current = this.currentFlow();
        if (!current || current.id !== flow.id) return;
        const validationErrors = flattenGroupedFlowValidation(validation);
        this.currentFlow.set({
          ...current,
          validationErrors
        });
        this.applyGroupedFlowValidation(validation, {
          ...current,
          validationErrors
        });
      },
      error: (error) => {
        console.error('Retrieve flow validation failed', error);
      }
    });
  }

  private validationFetchKey(flow: Flow): string {
    return `${flow.id}:${flow.status}:${flow.updatedAt?.toISOString?.() ?? ''}`;
  }

  private deriveGlobalInputReferenceErrors(flow: Flow): FlowValidationError[] {
    const definedGlobals = new Set(
      (flow.data.globalInputs ?? [])
        .map((input) => String(input.name ?? '').trim())
        .filter((name) => name.length > 0)
    );
    const occurrences = new Map<string, Set<string>>();

    const collectFromValue = (value: unknown, ownerNodeId: string) => {
      if (typeof value === 'string') {
        const names = extractReferencedGlobalNames(value);
        for (const name of names) {
          if (definedGlobals.has(name)) continue;
          if (!occurrences.has(name)) {
            occurrences.set(name, new Set<string>());
          }
          occurrences.get(name)!.add(ownerNodeId);
        }
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) collectFromValue(item, ownerNodeId);
        return;
      }

      if (value && typeof value === 'object') {
        for (const item of Object.values(value as Record<string, unknown>)) {
          collectFromValue(item, ownerNodeId);
        }
      }
    };

    const scanNodeConfiguration = (nodeId: string, configuration: unknown) => {
      if (!configuration || typeof configuration !== 'object') return;
      collectFromValue(configuration, nodeId);
    };

    for (const block of flow.data.blocks ?? []) {
      scanNodeConfiguration(block.id, block.specificConfiguration);
    }
    for (const container of flow.data.containers ?? []) {
      scanNodeConfiguration(container.id, container.specificConfiguration);
    }

    return Array.from(occurrences.entries()).map(([name, nodeIds]) => ({
      code: 'GLOBAL_INPUT_NOT_DEFINED',
      entity: 'flow',
      field: 'globalInputs',
      id: flow.id,
      message: `Global input "${name}" is referenced but not defined. The flow can be saved, but it will remain DRAFT / not executable.`,
      relatedNodeIds: Array.from(nodeIds)
    }));
  }
}

function extractReferencedGlobalNames(content: string): string[] {
  const names = new Set<string>();
  const templateRegex = /\$\{\{\s*global\.([A-Za-z0-9_]+)\s*\}\}/g;
  const spelRegex = /#global\.([A-Za-z0-9_]+)/g;

  let match: RegExpExecArray | null;
  while ((match = templateRegex.exec(content)) !== null) {
    names.add(match[1]);
  }
  while ((match = spelRegex.exec(content)) !== null) {
    names.add(match[1]);
  }

  return Array.from(names);
}

function emptyGroupedFlowValidation(): GroupedFlowValidation {
  return { flowLevel: [], byContainer: {} };
}

function isGuardSubflow(configurationPath: string): boolean {
  return configurationPath.split('.').at(-1)?.toLowerCase().includes('guard') ?? false;
}
