import { TestBed } from '@angular/core/testing';
import { BiasComparisonViewStateService } from './bias-comparison-view-state';
import { BiasImpactReport } from '@models/bias-impact';

const REPORT: BiasImpactReport = {
  id: 'report-1',
  experimentId: 'experiment-1',
  kind: 'FULL_FLOW',
  baselineExecutionId: 'baseline-1',
  biasedExecutionId: 'variant-1',
  nodeId: null,
  annotationIds: ['annotation-1'],
  repetitions: 1,
  createdAt: '2026-07-21T10:00:00',
  rawOutputsIncluded: true,
  immediateImpact: {
    outputChanged: true,
    maximumTextDifference: 0.5,
    changeRate: 1,
    baselineOutput: {},
    biasedOutputs: [{}]
  },
  downstreamImpact: [
    { nodeId: 'node-changed', nodeName: 'Changed', baselineStatus: 'COMPLETED', biasedStatus: 'COMPLETED', changed: true, baselineOutputs: {}, biasedOutputs: {} },
    { nodeId: 'node-unchanged', nodeName: 'Unchanged', baselineStatus: 'COMPLETED', biasedStatus: 'COMPLETED', changed: false, baselineOutputs: {}, biasedOutputs: {} }
  ],
  routingChanges: [
    { nodeId: 'router-1', baselineBranch: 'false', biasedBranch: 'true' }
  ],
  mockedSideEffects: [],
  summary: 'Outputs changed',
  warnings: []
};

describe('BiasComparisonViewStateService', () => {
  let service: BiasComparisonViewStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BiasComparisonViewStateService);
  });

  it('starts with no active view', () => {
    expect(service.activeView()).toBeNull();
    expect(service.isNodeDownstreamChanged('node-changed')).toBe(false);
  });

  it('flags nodes present in downstreamImpact with changed=true', () => {
    service.show({ report: REPORT });
    expect(service.isNodeDownstreamChanged('node-changed')).toBe(true);
    expect(service.isNodeDownstreamChanged('node-unchanged')).toBe(false);
    expect(service.isNodeDownstreamChanged('node-unknown')).toBe(false);
  });

  it('flags the router node referenced by a routing change', () => {
    service.show({ report: REPORT });
    expect(service.isRoutingChangeSource('router-1')).toBe(true);
    expect(service.isRoutingChangeSource('node-changed')).toBe(false);
  });

  it('flags only the connection matching the biased branch', () => {
    service.show({ report: REPORT });
    expect(service.isBiasedRoutingConnection('router-1', 'true')).toBe(true);
    expect(service.isBiasedRoutingConnection('router-1', 'false')).toBe(false);
  });

  it('clears the active view', () => {
    service.show({ report: REPORT });
    service.clear();
    expect(service.activeView()).toBeNull();
    expect(service.isNodeDownstreamChanged('node-changed')).toBe(false);
  });
});
