import { Component, computed, ElementRef, inject, linkedSignal, ViewChild, WritableSignal } from '@angular/core';
import { EditorStateHolder } from '@stores/flow-editor';

@Component({
  selector: 'app-title-toolbar',
  imports: [],
  templateUrl: './title-toolbar.html',
  styleUrl: './title-toolbar.css',
})
export class TitleToolbar {

  @ViewChild('titleInput') myInputRef!: ElementRef;

  private editorState: EditorStateHolder = inject(EditorStateHolder);
  title = computed(() => {
    const flow = this.editorState.currentFlow();
    return flow ? flow.name : 'No Flow Opened';
  });

  tempTitle: WritableSignal<string | null> = linkedSignal(() =>null);

  titleWidth = computed(() => {
    const temp = this.tempTitle();
    if (temp !== null) {
      return Math.max(temp.length-1, 4)
    }
    const len = this.title().length || 4;
    return Math.min(len, 20)-2;
  });

  notSaved = computed(() => this.editorState.isDirty());


  changeTitle(value: string) {
    this.tempTitle.set(null);
    const trimmed = value.trim();
    if (value === this.title()) return;
    if (trimmed.length < 4) {
      this.myInputRef.nativeElement.value = this.title();
      return;
    }
    console.log('Updating flow title to:', trimmed);
    const flow = this.editorState.currentFlow()!;
    this.editorState.updateFlow({ ...flow, name: trimmed });
  }

  save() {
    if (!this.notSaved()) return;
    this.editorState.save().subscribe(
      err => console.error('Save failed', err)
    );
  }

}
