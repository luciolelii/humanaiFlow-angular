import { Injectable, signal } from '@angular/core';
import { FlowData } from '@models/flow';

type SubflowPreviewDialogState = {
  title: string;
  flowData: FlowData;
  sourceName: string;
};

@Injectable({ providedIn: 'root' })
export class SubflowPreviewDialogService {
  private readonly _state = signal<SubflowPreviewDialogState | null>(null);

  readonly state = this._state.asReadonly();

  open(flowData: FlowData, title?: string, sourceName?: string) {
    const normalizedSourceName = sourceName?.trim() || this.deriveSourceName(title);
    this._state.set({
      title: title?.trim() || 'Subflow Preview',
      flowData,
      sourceName: normalizedSourceName
    });
  }

  close() {
    this._state.set(null);
  }

  private deriveSourceName(title?: string): string {
    const normalizedTitle = title?.trim();
    if (!normalizedTitle) return 'container';

    const suffix = ' subflow';
    const lowerTitle = normalizedTitle.toLowerCase();
    if (lowerTitle.endsWith(suffix)) {
      return normalizedTitle.slice(0, normalizedTitle.length - suffix.length).trim() || 'container';
    }

    return normalizedTitle;
  }
}
