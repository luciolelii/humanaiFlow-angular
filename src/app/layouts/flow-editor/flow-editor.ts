import { Component, inject, signal } from '@angular/core';
import { environment } from '@environment';
import { EditorSidebar } from "@pages/main/editor-sidebar/editor-sidebar";
import { EditorStateHolder } from '@stores/flow-editor';
import { FlowAssistant } from '@shared/flow-assistant/flow-assistant';
import { TitleToolbar } from "@shared/title-toolbar/title-toolbar";
import { ReteEditor } from "@shared/rete-editor/rete-editor";

@Component({
  selector: 'app-flow-editor',
  imports: [EditorSidebar, TitleToolbar, ReteEditor, FlowAssistant],
  templateUrl: './flow-editor.html',
  styleUrl: './flow-editor.css',
})
export class FlowEditor {

  private editorState: EditorStateHolder = inject(EditorStateHolder);

  assistantEnabled = environment.assistantEnabled;
  assistantOpen = signal(true);
  flow = this.editorState.currentFlow; 

  toggleAssistant() {
    this.assistantOpen.update((value) => !value);
  }

}
