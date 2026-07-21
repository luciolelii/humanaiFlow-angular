import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BiasImpactReport } from '@models/bias-impact';
import { BiasImpactReportViewerComponent } from './bias-impact-report-viewer';

describe('BiasImpactReportViewerComponent', () => {
  let fixture: ComponentFixture<BiasImpactReportViewerComponent>;

  const report: BiasImpactReport = {
    id: 'report-1',
    experimentId: 'experiment-1',
    kind: 'FULL_FLOW',
    baselineExecutionId: 'execution-base',
    biasedExecutionId: 'execution-biased',
    nodeId: null,
    annotationIds: ['annotation-1'],
    repetitions: 3,
    createdAt: '2026-07-21T10:00:00.000Z',
    rawOutputsIncluded: false,
    immediateImpact: {
      outputChanged: true,
      changeRate: .5,
      maximumTextDifference: .25,
      baselineOutput: 'baseline',
      biasedOutputs: ['biased']
    },
    downstreamImpact: [
      { nodeId: 'node-changed', nodeName: 'Changed node', baselineStatus: 'COMPLETED', biasedStatus: 'COMPLETED', changed: true, baselineOutputs: 'a', biasedOutputs: 'b' },
      { nodeId: 'node-same', nodeName: 'Same node', baselineStatus: 'COMPLETED', biasedStatus: 'COMPLETED', changed: false, baselineOutputs: 'a', biasedOutputs: 'a' }
    ],
    routingChanges: [{ nodeId: 'router', baselineBranch: 'yes', biasedBranch: 'no' }],
    mockedSideEffects: [{ nodeId: 'http', nodeName: 'HTTP request', kind: 'HTTP' }],
    summary: 'The biased variant changed the output.',
    warnings: []
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BiasImpactReportViewerComponent] }).compileComponents();
    fixture = TestBed.createComponent(BiasImpactReportViewerComponent);
    fixture.componentInstance.report = report;
  });

  it('renders metadata, impact sections, side effects and the raw-output notice', () => {
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('execution-base');
    expect(text).toContain('execution-biased');
    expect(text).not.toContain('Node\n');
    expect(text).toContain('Change rate: 50.0%');
    expect(text).toContain('router');
    expect(text).toContain('HTTP request');
    expect(text).toContain('intentionally omitted');
    expect(text).toContain('No warnings reported.');
  });

  it('filters downstream entries to changed nodes', () => {
    fixture.componentInstance.changedOnly = true;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Changed node');
    expect(text).not.toContain('Same node');
  });

  it('emits highlightOnCanvas when the highlight button is clicked', () => {
    fixture.detectChanges();
    let emitted = false;
    fixture.componentInstance.highlightOnCanvas.subscribe(() => { emitted = true; });

    (fixture.nativeElement.querySelector('.bias-impact-report__highlight-btn') as HTMLButtonElement).click();

    expect(emitted).toBe(true);
  });
});
