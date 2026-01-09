import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Flow } from '@models/flow';
import { EditorStateHolder } from 'app/stores/editor';

type FlowFilter = 'all' | 'public' | 'private';

@Component({
  selector: 'app-flows-list',
  imports: [CommonModule],
  templateUrl: './flows-list.html',
  styleUrl: './flows-list.css',
})
export class FlowsList {
  filter: FlowFilter = 'all';

  private editorState = inject(EditorStateHolder);

  flows : Flow[] = [
    { id: '1', name: 'Flow One', visibility: 'public', data: {} },
    { id: '2', name: 'Flow Two', visibility: 'private', data: {} },
    { id: '3', name: 'Flow Three', visibility: 'public', data: {} },
    { id: '4', name: 'Flow Four', visibility: 'private', data: {} },
  ]

  get filteredFlows() {
    if (this.filter === 'all') return this.flows;
    return this.flows.filter(f => f.visibility === this.filter);
  }

  open(flow: Flow) {
    console.log('Opening flow:', flow);
    this.editorState.openDocument(flow);
  }
}
