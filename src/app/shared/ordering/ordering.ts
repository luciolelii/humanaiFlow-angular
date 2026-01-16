import { Component, effect, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';


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

  constructor() {
    effect(() => {
      this.orderChanged.emit({ orderBy: this.orderBy(), orderDir: this.orderDir() });
    });
  }

  orderFields = input.required<OrderField[]>();

  orderDir = model<orderDirType>('asc');

  orderBy = model<string | null>(null);

  orderChanged = output<OrderEvent>();

}
