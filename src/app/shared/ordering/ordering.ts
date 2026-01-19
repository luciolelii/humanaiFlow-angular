import { Component, effect, Input, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrderViewState } from '@utilities/list-state-holder';

export type OrderEvent = { orderBy: string | null; orderDir: orderDirType };
export type orderDirType = 'asc' | 'desc';
export type OrderField = { field: string; label?: string };


@Component({
  selector: 'app-ordering',
  imports: [FormsModule],
  templateUrl: './ordering.html',
  styleUrl: './ordering.css',
})
export class Ordering {

  @Input({required : true}) orderView!: OrderViewState;

  constructor() {
    effect(() => {
      this.orderChanged.emit({ orderBy: this.orderBy(), orderDir: this.orderDir() });
    });
  }

  orderFields = input.required<OrderField[]>();

  orderDir = model<orderDirType>('asc');

  orderBy = model<string | null>(null);

  ngOnInit() {
    if (this.orderView.orderBy) {
      this.orderBy.set(this.orderView.orderBy);
      this.orderDir.set(this.orderView.orderDir);
    }
  }

  orderChanged = output<OrderEvent>();

}
