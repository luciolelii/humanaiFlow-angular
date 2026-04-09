import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, Signal, WritableSignal } from '@angular/core';
import { Flow, FlowVisibility } from '@models/flow';
import { FlowsService } from '@services/flows/flows';
import { FlowItem } from './flow-item/flow-item';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { OrderEvent, OrderField, Ordering, orderDirType } from "@shared/ordering/ordering";
import { ListStateViewHolder, OrderViewState } from '@utilities/list-state-holder';

type FlowFilter = FlowVisibility | 'FINALIZED' | 'all';

@Component({
  selector: 'app-flows-list',
  imports: [FlowItem, Ordering, MatButtonToggleModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatListModule, MatProgressSpinnerModule],
  templateUrl: './flows-list.html',
  styleUrl: './flows-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowsList extends ListStateViewHolder<Flow> {
  filter = signal<FlowFilter>('all');

  orderFields: OrderField[] = [
    { field: 'name', label: 'Name' },
    { field: 'updatedAt', label: 'Last Update Date' },
    { field: 'createdAt', label: 'Creation Date' }
  ];

  readonly orderBy = signal<string | null>('name');
  readonly orderDir = signal<orderDirType>('asc');

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
    this.orderBy.set(existingState.order.orderBy);
    this.orderDir.set(existingState.order.orderDir);

    if (existingState.list) {
      this.flows = existingState.list;
      this.loading.set(false);
      if (existingState.filter)
        this.filter.set(existingState.filter as FlowFilter || 'all');
      return;
    }

    if (this.flowsService.hasLoadedFlows()) {
      this.flows = this.flowsService.flows;
      this.view.list = this.flows;
      this.loading.set(false);
      return;
    }

    this.flowsService.getAllFlows().then(flowsSignal => {
      this.flows = flowsSignal;
      this.view.list = this.flows;
    }).catch((err) => {
      console.error('Error loading flows', err);
    }).finally(() => {
      this.loading.set(false);
    });
  }

  filteredFlows = computed(() => {
    const flows = this.flows ? this.flows() : [];
    if (!flows) return [];
    const filteredFlows = flows.filter(f => f.name.toLowerCase().includes(this.searchTerm().toLowerCase()));
    if (this.filter() === 'all') return filteredFlows;
    if (this.filter() === 'FINALIZED') return filteredFlows.filter(f => !!f.finalized);
    return filteredFlows.filter(f => f.visibility === this.filter());
  });

  orderedFlows = computed(() => {
    const flows = [...this.filteredFlows()];
    const orderBy = this.orderBy();
    const orderDir = this.orderDir();
    if (!orderBy) return flows;

    return flows.sort((a, b) => {
      const aValue = this.toComparableValue((a as any)[orderBy]);
      const bValue = this.toComparableValue((b as any)[orderBy]);
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return orderDir === 'asc' ? -1 : 1;
      if (bValue == null) return orderDir === 'asc' ? 1 : -1;
      if (aValue < bValue) return orderDir === 'asc' ? -1 : 1;
      if (aValue > bValue) return orderDir === 'asc' ? 1 : -1;
      return 0;
    });
  });


  onOrderChanged(event: OrderEvent) {
    const { orderBy, orderDir } = event;
    this.orderBy.set(orderBy);
    this.orderDir.set(orderDir);
    this.view.order = { orderBy, orderDir };
  }

  private toComparableValue(value: unknown): string | number | null {
    if (value == null) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string') return value.toLowerCase();
    if (typeof value === 'number') return value;
    return String(value).toLowerCase();
  }

}
