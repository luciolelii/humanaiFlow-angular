import { CommonModule } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { BlocksService } from '@services/blocks/blocks';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { take } from 'rxjs';
import { EditorStateHolder } from '@stores/flow-editor';

@Component({
  selector: 'app-title-toolbar',
  imports: [CommonModule],
  templateUrl: './title-toolbar.html',
  styleUrl: './title-toolbar.css',
})
export class TitleToolbar {
  private snackTimeout: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('titleInput') myInputRef!: ElementRef;

  editorState: EditorStateHolder = inject(EditorStateHolder);
  private router = inject(Router);
  private blocksService = inject(BlocksService);
  private taskExecutionsService = inject(TaskExecutionsService);
  flow = computed(() => this.editorState.currentFlow());
  title = computed(() => {
    const flow = this.flow();
    return flow ? flow.name : 'No Flow Opened';
  });

  notSaved = computed(() => this.editorState.isDirty());
  blockSyncInProgress = this.blocksService.hasPendingServerSync;
  canSave = computed(() => this.notSaved() && !this.blockSyncInProgress());
  canExecute = computed(() => {
    const flow = this.flow();
    return !!flow && !this.notSaved() && !this.blockSyncInProgress() && flow.status === 'EXECUTABLE';
  });
  executeLoading = signal(false);
  snackbarMessage = signal<string | null>(null);
  snackbarType = signal<'success' | 'error'>('success');


  changeTitle(value: string) {
    const trimmed = value.trim();
    if (value === this.title()) return;
    if (trimmed.length < 4) {
      this.myInputRef.nativeElement.value = this.title();
      return;
    }
    console.log('Updating flow title to:', trimmed);
    this.editorState.updateFlowTitle(trimmed );
  }

  save() {
    if (!this.canSave()) return;
    this.editorState.save().pipe(
      take(1)
    ).subscribe({
      next: () => {
        console.log('Flow saved');
        this.showSnackbar('Flow saved', 'success');
      },
      error: err => {
        console.error('Save failed', err);
        this.showSnackbar('Errore durante il salvataggio', 'error');
      }
    });
  }

  undo() {
    this.editorState.undo();
  }

  redo() {
    this.editorState.redo();
  }

  execute() {
    const flow = this.flow();
    if (!flow || !this.canExecute() || this.executeLoading()) return;

    this.executeLoading.set(true);
    this.taskExecutionsService.createExecution(flow.id).pipe(
      take(1)
    ).subscribe({
      next: () => {
        this.executeLoading.set(false);
        this.router.navigate(['/tasks']);
      },
      error: (err) => {
        this.executeLoading.set(false);
        console.error('Create execution failed', err);
        this.showSnackbar('Errore durante la creazione dell\'esecuzione', 'error');
      }
    });
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
