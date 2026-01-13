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

  
}
