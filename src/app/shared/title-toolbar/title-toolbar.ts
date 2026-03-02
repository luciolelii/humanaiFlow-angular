import { Component, computed, ElementRef, inject, ViewChild } from '@angular/core';
import { EditorStateHolder } from '@stores/flow-editor';

@Component({
  selector: 'app-title-toolbar',
  imports: [],
  templateUrl: './title-toolbar.html',
  styleUrl: './title-toolbar.css',
})
export class TitleToolbar {

  @ViewChild('titleInput') myInputRef!: ElementRef;

  editorState: EditorStateHolder = inject(EditorStateHolder);
  title = computed(() => {
    const flow = this.editorState.currentFlow();
    return flow ? flow.name : 'No Flow Opened';
  });

  notSaved = computed(() => this.editorState.isDirty());


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
    this.editorState.save().subscribe(
      err => console.error('Save failed', err)
    );
  }

  undo() {
    this.editorState.undo();
  }

  redo() {
    this.editorState.redo();
  } 
}
