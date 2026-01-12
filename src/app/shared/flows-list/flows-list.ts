import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, Signal, WritableSignal } from '@angular/core';
import { Flow } from '@models/flow';
import { FlowsService } from '@services/flows/flows';
import { EditorStateHolder } from 'app/stores/editor';

type FlowFilter = 'all' | 'public' | 'private';

@Component({
  selector: 'app-flows-list',
  imports: [CommonModule],
  templateUrl: './flows-list.html',
  styleUrl: './flows-list.css',
})
export class FlowsList {
  filter = signal<FlowFilter>('all');

  private editorState = inject(EditorStateHolder);
  private flowsService = inject(FlowsService);

  loading: WritableSignal<boolean> = signal(true);

  flows: Signal<Flow[]> | undefined;

  ngOnInit() {
    this.flowsService.getAllFlows().then(flowsSignal => {
      this.flows = flowsSignal;
      this.loading.set(false);
    });
  }
  
  filteredFlows = computed(() => {
    if (!this.flows) return [];
    if (this.filter() === 'all') return this.flows();
    return this.flows().filter(f => f.visibility === this.filter());
  });

  open(flow: Flow) {
    console.log('Opening flow:', flow);
    this.editorState.openDocument(flow);
  }
}
