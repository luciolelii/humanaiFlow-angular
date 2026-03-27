import { CommonModule } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
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
})
export class TitleToolbar {
  private snackTimeout: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('titleInput') myInputRef!: ElementRef;

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
  canSave = computed(() => !this.readOnly() && this.notSaved() && !this.blockSyncInProgress());
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

  startEditingTitle() {
    const flow = this.flow();
    if (!flow || this.readOnly()) return;
    this.draftTitle.set(flow.name);
    this.editingTitle.set(true);
    queueMicrotask(() => {
      this.myInputRef?.nativeElement?.focus();
      this.myInputRef?.nativeElement?.select();
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
      this.myInputRef.nativeElement.value = this.title();
      this.editingTitle.set(false);
      return;
    }
    console.log('Updating flow title to:', trimmed);
    this.editorState.updateFlowTitle(trimmed );
    this.draftTitle.set(trimmed);
    this.editingTitle.set(false);
  }

  save() {
    if (!this.canSave()) return;
    this.editorState.save().pipe(
      take(1)
    ).subscribe({
      next: (savedFlow) => {
        console.log('Flow saved');
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
