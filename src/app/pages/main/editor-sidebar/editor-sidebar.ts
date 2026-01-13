import { Component, computed, inject, signal } from '@angular/core';
import { GroupHolder } from '@shared/group-holder/group-holder';
import { FlowsList } from '@shared/flows-list/flows-list';
import { EditorStateHolder } from '@stores/flow-editor';
import { CommonModule } from '@angular/common';

type OpenedId = 'flows' | 'blocks';

@Component({
  selector: 'app-editor-sidebar',
  imports: [GroupHolder, FlowsList, CommonModule],
  templateUrl: './editor-sidebar.html',
  styleUrl: './editor-sidebar.css',
})
export class EditorSidebar {

  flowState = inject(EditorStateHolder);

  blockDisabled = computed(() => !this.flowState.hasFlow());

  collapsed = signal(true);

  open: OpenedId | null = null;


  openSide(id: OpenedId) {
    this.open = id;
    this.collapsed.set(false);
  }

  collapse() {
    this.collapsed.set(true);
  }
 
}
