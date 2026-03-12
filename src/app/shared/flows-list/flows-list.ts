import { Component, computed, effect, inject, model, signal, Signal, WritableSignal } from '@angular/core';
import { Flow, FlowVisibility } from '@models/flow';
import { FlowsService } from '@services/flows/flows';
import { FlowItem } from './flow-item/flow-item';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { OrderEvent, OrderField, Ordering } from "@shared/ordering/ordering";
import { ListStateViewHolder, OrderViewState } from '@utilities/list-state-holder';

type FlowFilter = FlowVisibility | 'all';

@Component({
  selector: 'app-flows-list',
  imports: [FlowItem, FormsModule, Ordering, MatButtonToggleModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatListModule, MatProgressSpinnerModule],
  templateUrl: './flows-list.html',
  styleUrl: './flows-list.css',
})
export class FlowsList extends ListStateViewHolder<Flow> {
  filter = signal<FlowFilter>('all');

  orderFields: OrderField[] = [
    { field: 'name', label: 'Name' },
    { field: 'updatedAt', label: 'Last Update Date' },
    { field: 'createdAt', label: 'Creation Date' }
  ];

  searchTerm = model<string>('');

  private flowsService = inject(FlowsService);

  loading: WritableSignal<boolean> = signal(true);
  
  get orderView() {
    const existingState = this.view;
    return existingState.order;
  }

  flows?: Signal<Flow[]>;

  detailOpenedId = signal<string | null>(null);

  constructor() {
    super('flowsList', {defaultOrder: { orderBy: 'name', orderDir: 'asc' } as OrderViewState, defaultFilter: 'all'});
    effect(() => {
      if (!!this.filter && this.filter() != null)
        this.view.filter = this.filter();
    });
  }

  ngOnInit() {
    const existingState = this.view;
    if (existingState.list) {
      this.flows = existingState.list;
      this.loading.set(false);
      if (existingState.filter)
        this.filter.set(existingState.filter as FlowFilter || 'all');
      console.log('FlowsList loaded from ListState');
    } else {
      this.flowsService.getAllFlows().then(flowsSignal => {
        this.flows = flowsSignal;
        this.loading.set(false);
        this.view.list = this.flows;
        console.log('FlowsList initialized from service');
    });
    }
    
  }

  filteredFlows = computed(() => {
    const flows = this.flows ? this.flows() : [];
    if (!flows) return [];
    const filteredFlows = flows.filter(f => f.name.toLowerCase().includes(this.searchTerm().toLowerCase()));
    if (this.filter() === 'all') return filteredFlows;
    return filteredFlows.filter(f => f.visibility === this.filter());
  });


  onOrderChanged(event: OrderEvent) {
    const { orderBy, orderDir } = event;
    this.view.order = { orderBy, orderDir };
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
