import { Injectable, signal } from '@angular/core';
import { BiasImpactReport } from '@models/bias-impact';

export type BiasComparisonView = {
  report: BiasImpactReport;
};

@Injectable({ providedIn: 'root' })
export class BiasComparisonViewStateService {
  private readonly _activeView = signal<BiasComparisonView | null>(null);
  readonly activeView = this._activeView.asReadonly();

  show(view: BiasComparisonView) {
    this._activeView.set(view);
  }

  clear() {
    this._activeView.set(null);
  }

  isNodeDownstreamChanged(nodeId: string | null): boolean {
    if (!nodeId) return false;
    const report = this._activeView()?.report;
    if (!report) return false;
    return report.downstreamImpact.some((entry) => entry.nodeId === nodeId && entry.changed);
  }

  isRoutingChangeSource(nodeId: string | null): boolean {
    if (!nodeId) return false;
    const report = this._activeView()?.report;
    if (!report) return false;
    return report.routingChanges.some((change) => change.nodeId === nodeId);
  }

  isBiasedRoutingConnection(sourceNodeId: string | null, sourceOutputName: string | null): boolean {
    if (!sourceNodeId || !sourceOutputName) return false;
    const report = this._activeView()?.report;
    if (!report) return false;
    return report.routingChanges.some((change) => change.nodeId === sourceNodeId && change.biasedBranch === sourceOutputName);
  }
}
