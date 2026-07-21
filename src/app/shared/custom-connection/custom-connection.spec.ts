import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GraphSelectionService } from '@services/graph-selection/graph-selection';
import { BiasComparisonViewStateService } from '@services/bias/bias-comparison-view-state';
import { BiasImpactReport } from '@models/bias-impact';

import { CustomConnectionComponent } from './custom-connection';

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
  immediateImpact: { outputChanged: true, maximumTextDifference: 0.5, changeRate: 1, baselineOutput: {}, biasedOutputs: [{}] },
  downstreamImpact: [],
  routingChanges: [{ nodeId: 'router-1', baselineBranch: 'false', biasedBranch: 'true' }],
  mockedSideEffects: [],
  summary: 'Outputs changed',
  warnings: []
};

describe('CustomConnectionComponent bias routing highlight', () => {
  let fixture: ComponentFixture<CustomConnectionComponent>;
  let component: CustomConnectionComponent;
  let comparisonViewState: BiasComparisonViewStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomConnectionComponent],
      providers: [
        { provide: GraphSelectionService, useValue: { selectedConnectionId: () => null, selectConnection: () => {}, requestDeleteSelectedConnection: () => {} } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CustomConnectionComponent);
    component = fixture.componentInstance;
    comparisonViewState = TestBed.inject(BiasComparisonViewStateService);
    component.data = { id: 'conn-1', source: 'router-1', sourceOutput: 'true', target: 'node-2', targetInput: 'input' } as any;
    component.start = { x: 0, y: 0 };
    component.end = { x: 100, y: 0 };
    fixture.detectChanges();
  });

  it('uses the default color when no bias report is highlighted', () => {
    expect(component.strokeColor).toBe('#4682b4');
  });

  it('highlights the connection matching the report biased branch', () => {
    comparisonViewState.show({ report: REPORT });
    expect(component.strokeColor).toBe('#b45309');
    expect(component.strokeWidth).toBe(6);
  });

  it('does not highlight the connection for the baseline branch', () => {
    component.data = { ...component.data, sourceOutput: 'false' } as any;
    comparisonViewState.show({ report: REPORT });
    expect(component.strokeColor).toBe('#4682b4');
  });
});
