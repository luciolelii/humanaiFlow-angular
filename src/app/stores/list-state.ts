import { Injectable } from '@angular/core';
import { ListView, OrderViewState } from '@utilities/list-state-holder';



@Injectable()
export class ListState {
  
  private states = new Map<string, ListView<any>>();

  get<T>(kind?: string): ListView<T> | null {
    if (!this.states.has(kind || 'default')) {
      return null;
    }
    return this.states.get(kind || 'default')!;
  }

  create<T>(kind?: string, options?: {defaultOrder?: OrderViewState, defaultFilter?: string}) {
    if (!this.states.has(kind || 'default')) {
      const view = new ListView<T>();
      if (options) {
        if (options.defaultOrder) {
          view.order = options.defaultOrder;
        }
        if (options.defaultFilter) {
          view.filter = options.defaultFilter;
        }
      }
      this.states.set(kind || 'default', view);
    }
  }


}
