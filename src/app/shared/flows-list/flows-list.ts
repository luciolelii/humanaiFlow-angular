import { CommonModule } from '@angular/common';
import { Component, computed, inject, model, output, signal, Signal, WritableSignal } from '@angular/core';
import { Flow } from '@models/flow';
import { FlowsService } from '@services/flows/flows';
import { FlowItem } from './flow-item/flow-item';
import { FormsModule } from '@angular/forms';
import { OrderEvent, OrderField, Ordering } from "@shared/ordering/ordering";

type FlowFilter = 'all' | 'public' | 'private';

@Component({
  selector: 'app-flows-list',
  imports: [FlowItem, FormsModule, Ordering],
  templateUrl: './flows-list.html',
  styleUrl: './flows-list.css',
})
export class FlowsList {
  filter = signal<FlowFilter>('all');

  orderFields : OrderField[] = [
    { field: 'name', label: 'Name' },
    { field: 'updatedAt', label: 'Last Update Date' },
    { field: 'createdAt', label: 'Creation Date' }
  ];

  searchTerm = model<string>('');
  
  private flowsService = inject(FlowsService);

  loading: WritableSignal<boolean> = signal(true);

  flows: Signal<Flow[] | null> = signal(null);

  detailOpenedId = signal<string | null>(null);

  ngOnInit() {
    this.flowsService.getAllFlows().then(flowsSignal => {
      this.flows = flowsSignal;
      this.loading.set(false);
    });
  }
  
  filteredFlows = computed(() => {
    const flows = this.flows();
    if (!flows) return [];
    const filteredFlows = flows.filter(f => f.name.toLowerCase().includes(this.searchTerm().toLowerCase()));
    if (this.filter() === 'all') return filteredFlows;
    return filteredFlows.filter(f => f.visibility === this.filter());
  });

  onOrderChanged(event: OrderEvent) {
    const { orderBy, orderDir } = event;
    const flows = this.filteredFlows();
    if (!orderBy) return flows;
    return flows.sort((a, b) => {
      const aValue = (a as any)[orderBy];
      const bValue = (b as any)[orderBy];
      if (aValue < bValue) return orderDir === 'asc' ? -1 : 1;
      if (aValue > bValue) return orderDir === 'asc' ? 1 : -1;
      return 0;
    }); 
  }
  
}
