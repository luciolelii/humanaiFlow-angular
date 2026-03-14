import { Injectable, signal } from '@angular/core';
import { FlowData } from '@models/flow';

type SubflowPreviewDialogState = {
  title: string;
  flowData: FlowData;
};

@Injectable({ providedIn: 'root' })
export class SubflowPreviewDialogService {
  private readonly _state = signal<SubflowPreviewDialogState | null>(null);

  readonly state = this._state.asReadonly();

  open(flowData: FlowData, title?: string) {
    this._state.set({
      title: title?.trim() || 'Subflow Preview',
      flowData
    });
  }

  close() {
    this._state.set(null);
  }
}
