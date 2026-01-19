import { Component, computed, inject, signal } from '@angular/core';
import { GroupHolder } from '@shared/group-holder/group-holder';
import { FlowsList } from '@shared/flows-list/flows-list';
import { EditorStateHolder } from '@stores/flow-editor';
import { CommonModule } from '@angular/common';
import { FlowsService } from '@services/flows/flows';
import { ListState } from '@stores/list-state';

type OpenedId = 'flows' | 'blocks';

@Component({
  selector: 'app-editor-sidebar',
  imports: [GroupHolder, FlowsList, CommonModule],
  templateUrl: './editor-sidebar.html',
  styleUrl: './editor-sidebar.css',
  providers:[ListState]
})
export class EditorSidebar {

  flowState = inject(EditorStateHolder);

  flowService = inject(FlowsService);

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

  createNewFlow() {
    console.log('Creating new flow...');
    this.flowService.createNewFlow().subscribe({
      next: flow => {
        console.log('New flow created:', flow);
        this.flowState.openDocument(flow);
      },
      error: err => {
        console.error('Error creating new flow:', err);
      },
    });
  }
 
}
