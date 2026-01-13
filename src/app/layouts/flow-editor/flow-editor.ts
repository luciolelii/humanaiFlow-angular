import { Component, inject } from '@angular/core';
import { Flow } from '@models/flow';
import { EditorSidebar } from "@pages/main/editor-sidebar/editor-sidebar";
import { EditorStateHolder } from '@stores/flow-editor';
import { TitleToolbar } from "@shared/title-toolbar/title-toolbar";

@Component({
  selector: 'app-flow-editor',
  imports: [EditorSidebar, TitleToolbar],
  templateUrl: './flow-editor.html',
  styleUrl: './flow-editor.css',
})
export class FlowEditor {

  private editorState: EditorStateHolder = inject(EditorStateHolder);

  flow = this.editorState.currentFlow; 
}
