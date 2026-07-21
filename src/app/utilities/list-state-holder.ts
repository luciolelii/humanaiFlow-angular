import { inject, Signal } from "@angular/core";
import { ListState } from "@stores/list-state";

/** Persisted sort state for a list view. */
export class OrderViewState {
  orderBy: string | null = null;
  orderDir: 'asc' | 'desc' = 'asc';
}

/**
 * View-level state for a named list: current filter text, reactive item signal,
 * and sort configuration. Stored in the global {@link ListState} store and
 * reused when the user navigates back to the same list.
 */
export class ListView<T> {
  filter?: string;
  list?: Signal<T[]>;
  order: OrderViewState = new OrderViewState();
}

/**
 * Base class for components that display a filterable/sortable list.
 *
 * On construction it looks up (or creates) a {@link ListView} entry in the
 * application-wide {@link ListState} store, keyed by `listName`. This ensures
 * filter text, sort column, and sort direction survive navigation.
 *
 * ### Usage
 * ```ts
 * class MyListPage extends ListStateViewHolder<Item> {
 *   constructor() { super('my-items', { defaultOrder: { orderBy: 'name', orderDir: 'asc' } }); }
 * }
 * ```
 *
 * Access the reactive state via `this.view`.
 */
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

}
