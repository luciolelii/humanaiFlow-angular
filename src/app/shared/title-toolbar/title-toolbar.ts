import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { FlowGlobalInput } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { Authorization } from '@services/authorization/authorization';
import { FlowsService } from '@services/flows/flows';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { take } from 'rxjs';
import { EditorStateHolder } from '@stores/flow-editor';

@Component({
  selector: 'app-title-toolbar',
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule, MatSlideToggleModule],
  templateUrl: './title-toolbar.html',
  styleUrl: './title-toolbar.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TitleToolbar {
  private static readonly GLOBAL_INPUTS_HELP_COMPACT_HEIGHT_BREAKPOINT = 900;
  private snackTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly titleInputRef = viewChild<ElementRef>('titleInput');

  editorState: EditorStateHolder = inject(EditorStateHolder);
  private router = inject(Router);
  private blocksService = inject(BlocksService);
  private flowsService = inject(FlowsService);
  private authorization = inject(Authorization);
  private taskExecutionsService = inject(TaskExecutionsService);
  flow = computed(() => this.editorState.currentFlow());
  readOnly = this.editorState.isCurrentFlowReadOnly;
  isOwner = computed(() => {
    const flow = this.flow();
    const username = this.authorization.loggedInUser()?.username ?? null;
    return !!flow && !!username && flow.author === username;
  });
  title = computed(() => {
    const flow = this.flow();
    return flow ? flow.name : 'No Flow Opened';
  });

  notSaved = computed(() => this.editorState.isDirty());
  blockSyncInProgress = this.blocksService.hasPendingServerSync;
  canSave = computed(() =>
    !this.readOnly() &&
    this.notSaved() &&
    !this.blockSyncInProgress() &&
    !this.hasGlobalInputValidationIssues()
  );
  compactGlobalInputsHelp = signal(this.shouldUseCompactGlobalInputsHelp());
  globalInputs = computed(() => this.flow()?.data.globalInputs ?? []);
  globalInputsHelpTooltip = computed(() =>
    `Use shared flow-level inputs for values reused by multiple nodes. Reference them as template ${this.globalTemplateReference('name')} or SpEL ${this.globalSpelReference('name')}.`
  );
  hasGlobalInputValidationIssues = computed(() =>
    this.globalInputValidationErrors().some((message) => !!message)
  );
  globalInputValidationErrors = computed(() => {
    const inputs = this.globalInputs();
    const nameCounts = new Map<string, number>();

    for (const input of inputs) {
      const normalized = String(input.name ?? '').trim().toLowerCase();
      if (!normalized) continue;
      nameCounts.set(normalized, (nameCounts.get(normalized) ?? 0) + 1);
    }

    return inputs.map((input) => {
      const name = String(input.name ?? '').trim();
      if (!name) return 'Name is required';
      if ((nameCounts.get(name.toLowerCase()) ?? 0) > 1) return 'Name must be unique';
      return null;
    });
  });
  canTogglePublished = computed(() => !!this.flow() && this.isOwner());
  canFinalize = computed(() => !!this.flow() && this.isOwner() && !this.flow()!.finalized);
  canExecute = computed(() => {
    const flow = this.flow();
    return !!flow && !this.notSaved() && !this.blockSyncInProgress() && flow.status === 'EXECUTABLE';
  });
  executeLoading = signal(false);
  publishSaving = signal(false);
  finalizeSaving = signal(false);
  snackbarMessage = signal<string | null>(null);
  snackbarType = signal<'success' | 'error'>('success');
  editingTitle = signal(false);
  draftTitle = signal('');
  globalInputsOpen = signal(false);
  creatingGlobalInput = signal(false);
  draftGlobalInput = signal<FlowGlobalInput>({ name: '', type: 'TEXT', multiple: false });

  startEditingTitle() {
    const flow = this.flow();
    if (!flow || this.readOnly()) return;
    this.draftTitle.set(flow.name);
    this.editingTitle.set(true);
    queueMicrotask(() => {
      this.titleInputRef()?.nativeElement?.focus();
      this.titleInputRef()?.nativeElement?.select();
    });
  }

  cancelEditingTitle() {
    this.editingTitle.set(false);
    this.draftTitle.set(this.title());
  }

  changeTitle(value: string) {
    if (this.readOnly()) return;
    const trimmed = value.trim();
    if (trimmed === this.title()) {
      this.editingTitle.set(false);
      return;
    }
    if (trimmed.length < 4) {
      this.draftTitle.set(this.title());
      const inputEl = this.titleInputRef()?.nativeElement;
      if (inputEl) inputEl.value = this.title();
      this.editingTitle.set(false);
      return;
    }
    this.editorState.updateFlowTitle(trimmed );
    this.draftTitle.set(trimmed);
    this.editingTitle.set(false);
  }

  addGlobalInput() {
    if (this.readOnly()) return;
    this.draftGlobalInput.set({ name: '', type: 'TEXT', multiple: false });
    this.creatingGlobalInput.set(true);
  }

  saveNewGlobalInput() {
    const flow = this.flow();
    if (!flow || this.readOnly()) return;

    const draft = this.draftGlobalInput();
    const name = draft.name.trim();
    if (!name) return;

    const alreadyExists = (flow.data.globalInputs ?? []).some((input) => input.name.trim().toLowerCase() === name.toLowerCase());
    if (alreadyExists) return;

    this.editorState.updateData({
      ...flow.data,
      globalInputs: [
        ...(flow.data.globalInputs ?? []),
        { ...draft, name }
      ]
    });
    this.creatingGlobalInput.set(false);
    this.globalInputsOpen.set(true);
  }

  cancelNewGlobalInput() {
    this.creatingGlobalInput.set(false);
  }

  updateDraftGlobalInput(patch: Partial<FlowGlobalInput>) {
    this.draftGlobalInput.update((current) => ({
      ...current,
      ...patch
    }));
  }

  updateGlobalInput(index: number, patch: Partial<FlowGlobalInput>) {
    const flow = this.flow();
    if (!flow || this.readOnly()) return;

    const globalInputs = [...(flow.data.globalInputs ?? [])];
    if (!globalInputs[index]) return;
    globalInputs[index] = {
      ...globalInputs[index],
      ...patch
    };

    this.editorState.updateData({
      ...flow.data,
      globalInputs
    });
  }

  removeGlobalInput(index: number) {
    const flow = this.flow();
    if (!flow || this.readOnly()) return;

    const globalInputs = [...(flow.data.globalInputs ?? [])];
    globalInputs.splice(index, 1);
    this.editorState.updateData({
      ...flow.data,
      globalInputs
    });
  }

  globalTemplateReference(name: string): string {
    const resolved = name.trim() || 'name';
    return `\${{global.${resolved}}}`;
  }

  globalSpelReference(name: string): string {
    const resolved = name.trim() || 'name';
    return `#global.${resolved}`;
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.compactGlobalInputsHelp.set(this.shouldUseCompactGlobalInputsHelp());
  }

  toggleGlobalInputs() {
    this.globalInputsOpen.update((open) => !open);
  }

  canSaveDraftGlobalInput(): boolean {
    const flow = this.flow();
    const draft = this.draftGlobalInput();
    const name = draft.name.trim();
    if (!flow || !name) return false;
    return !(flow.data.globalInputs ?? []).some((input) => input.name.trim().toLowerCase() === name.toLowerCase());
  }

  private shouldUseCompactGlobalInputsHelp(): boolean {
    return typeof window !== 'undefined' && window.innerHeight <= TitleToolbar.GLOBAL_INPUTS_HELP_COMPACT_HEIGHT_BREAKPOINT;
  }

  save() {
    if (!this.canSave()) return;
    this.editorState.save().pipe(
      take(1)
    ).subscribe({
      next: (savedFlow) => {
        if ((savedFlow.validationErrors?.length ?? 0) > 0 && savedFlow.status === 'DRAFT') {
          this.showSnackbar('Flow saved as draft with validation errors', 'error');
        } else {
          this.showSnackbar('Flow saved', 'success');
        }
      },
      error: err => {
        console.error('Save failed', err);
        this.showSnackbar(err instanceof Error ? err.message : 'Errore durante il salvataggio', 'error');
      }
    });
  }

  execute() {
    const flow = this.flow();
    if (!flow || !this.canExecute() || this.executeLoading()) return;

    this.executeLoading.set(true);
    void this.router.navigate(['/tasks']);
    this.taskExecutionsService.createExecution(flow.id).pipe(
      take(1)
    ).subscribe({
      next: (execution) => {
        this.executeLoading.set(false);
        this.router.navigate(['/tasks'], {
          queryParams: { executionId: execution.id }
        });
      },
      error: (err) => {
        this.executeLoading.set(false);
        console.error('Create execution failed', err);
        this.showSnackbar('Errore durante la creazione dell\'esecuzione', 'error');
      }
    });
  }

  togglePublished(nextValue: boolean) {
    const flow = this.flow();
    if (!flow || !this.canTogglePublished() || this.publishSaving()) return;

    this.publishSaving.set(true);
    this.flowsService.updatePublished(flow.id, nextValue).pipe(take(1)).subscribe({
      next: (updatedFlow) => {
        this.editorState.openDocument(updatedFlow, { skipDirtyCheck: true });
        this.publishSaving.set(false);
        this.showSnackbar(nextValue ? 'Flow published' : 'Flow unpublished', 'success');
      },
      error: (err) => {
        this.publishSaving.set(false);
        console.error('Update published failed', err);
        this.showSnackbar(err instanceof Error ? err.message : 'Unable to update published flag', 'error');
      }
    });
  }

  finalizeFlow() {
    const flow = this.flow();
    if (!flow || !this.canFinalize() || this.finalizeSaving()) return;

    this.finalizeSaving.set(true);
    this.flowsService.finalizeFlow(flow.id).pipe(take(1)).subscribe({
      next: (updatedFlow) => {
        this.editorState.openDocument(updatedFlow, { skipDirtyCheck: true });
        this.finalizeSaving.set(false);
        this.showSnackbar('Flow finalized', 'success');
      },
      error: (err) => {
        this.finalizeSaving.set(false);
        console.error('Finalize flow failed', err);
        this.showSnackbar(err instanceof Error ? err.message : 'Unable to finalize flow', 'error');
      }
    });
  }

  onFinalizedToggle(nextValue: boolean) {
    if (!nextValue) return;
    this.finalizeFlow();
  }

  private showSnackbar(message: string, type: 'success' | 'error') {
    this.snackbarMessage.set(message);
    this.snackbarType.set(type);

    if (this.snackTimeout) {
      clearTimeout(this.snackTimeout);
    }

    this.snackTimeout = setTimeout(() => {
      this.snackbarMessage.set(null);
      this.snackTimeout = null;
    }, 2500);
  }
}
