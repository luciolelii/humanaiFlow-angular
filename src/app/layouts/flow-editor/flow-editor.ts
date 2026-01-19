import { Component, inject} from '@angular/core';
import { EditorSidebar } from "@pages/main/editor-sidebar/editor-sidebar";
import { EditorStateHolder } from '@stores/flow-editor';
import { TitleToolbar } from "@shared/title-toolbar/title-toolbar";
import { ReteEditor } from "@shared/rete-editor/rete-editor";

@Component({
  selector: 'app-flow-editor',
  imports: [EditorSidebar, TitleToolbar, ReteEditor],
  templateUrl: './flow-editor.html',
  styleUrl: './flow-editor.css',
})
export class FlowEditor {

  private editorState: EditorStateHolder = inject(EditorStateHolder);

  flow = this.editorState.currentFlow; 

}
