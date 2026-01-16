import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, Signal, WritableSignal } from '@angular/core';
import { Flow } from '@models/flow';
import { FlowsService } from '@services/flows/flows';
import { FlowItem } from './flow-item/flow-item';

type FlowFilter = 'all' | 'public' | 'private';

@Component({
  selector: 'app-flows-list',
  imports: [FlowItem],
  templateUrl: './flows-list.html',
  styleUrl: './flows-list.css',
})
export class FlowsList {
  filter = signal<FlowFilter>('all');

  
  private flowsService = inject(FlowsService);

  loading: WritableSignal<boolean> = signal(true);

  flows: Signal<Flow[]> | undefined;

  detailOpenedId = signal<string | null>(null);

  ngOnInit() {
    this.flowsService.getAllFlows().then(flowsSignal => {
      this.flows = flowsSignal;
      this.loading.set(false);
    });
  }
  
  filteredFlows = computed(() => {
    const flows = this.flows?.();
    console.log('Filtering flows', flows?.map(f => f.name));
    if (!flows) return [];
    if (this.filter() === 'all') return flows;
    return flows.filter(f => f.visibility === this.filter());
  });
  
}
