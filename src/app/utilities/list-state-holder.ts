import { inject, signal, Signal } from "@angular/core";
import { ListState } from "@stores/list-state";

export class OrderViewState {
  orderBy: string | null = null;
  orderDir: 'asc' | 'desc' = 'asc';
}

export class ListView<T> {
  filter?: string;
  list?: Signal<T[]>;
  order: OrderViewState = new OrderViewState();
}

export class ListStateViewHolder<T> {
  
  private state: ListView<T> = new ListView<T>();

  listName?: string;

  constructor(listName?: string, options?: {defaultOrder?: OrderViewState, defaultFilter?: string}) {
    this.listName = listName;
    const listState = inject(ListState);
    if (listState.get<T>(this.listName) == null) {
      listState.create<T>(this.listName, options);
    }
    this.state = listState.get<T>(this.listName)!;
  }

  get view(): ListView<T> {
    return this.state;
  }

  create() {
    this.state = new ListView<T>();
  }

}