import { CommonModule } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, ViewChild } from '@angular/core';
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
  flow = computed(() => this.editorState.currentFlow());
  title = computed(() => {
    const flow = this.flow();
    return flow ? flow.name : 'No Flow Opened';
  });

  notSaved = computed(() => this.editorState.isDirty());
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
    if (!this.notSaved()) return;
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
