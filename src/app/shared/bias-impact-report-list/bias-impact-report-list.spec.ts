import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BiasImpactReportListComponent } from './bias-impact-report-list';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { BiasImpactReport } from '@models/bias-impact';

function makeReport(overrides: Partial<BiasImpactReport> = {}): BiasImpactReport {
  return {
    id: 'report-1',
    experimentId: 'experiment-1',
    kind: 'ISOLATED_STEP',
    baselineExecutionId: 'execution-1',
    biasedExecutionId: null,
    nodeId: 'node-1',
    annotationIds: ['annotation-1', 'annotation-2'],
    repetitions: 3,
    createdAt: '2026-07-21T10:00:00',
    rawOutputsIncluded: true,
    immediateImpact: {
      outputChanged: true,
      maximumTextDifference: 0.4,
      changeRate: 0.5,
      baselineOutput: { output: 'baseline' },
      biasedOutputs: [{ output: 'variant' }]
    },
    downstreamImpact: [],
    routingChanges: [],
    mockedSideEffects: [],
    summary: 'Output changed',
    warnings: [],
    ...overrides
  };
}

describe('BiasImpactReportListComponent', () => {
  let fixture: ComponentFixture<BiasImpactReportListComponent>;
  let listBiasImpactReports: ReturnType<typeof vi.fn>;
  let getBiasImpactReport: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listBiasImpactReports = vi.fn().mockReturnValue(of([makeReport()]));
    getBiasImpactReport = vi.fn().mockReturnValue(of(makeReport()));

    await TestBed.configureTestingModule({
      imports: [BiasImpactReportListComponent],
      providers: [
        { provide: TaskExecutionsService, useValue: { listBiasImpactReports, getBiasImpactReport } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BiasImpactReportListComponent);
  });

  it('loads and renders the reports for the given execution', () => {
    fixture.componentRef.setInput('executionId', 'execution-1');
    fixture.detectChanges();

    expect(listBiasImpactReports).toHaveBeenCalledWith('execution-1');
    expect(fixture.componentInstance.reports().length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.bias-report-list__row').length).toBe(1);
  });

  it('shows an empty state when there are no reports', () => {
    listBiasImpactReports.mockReturnValue(of([]));
    fixture.componentRef.setInput('executionId', 'execution-1');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No bias impact reports');
  });

  it('shows an inline error with a retry action when the list fails to load', () => {
    listBiasImpactReports.mockReturnValue(throwError(() => new Error('network down')));
    fixture.componentRef.setInput('executionId', 'execution-1');
    fixture.detectChanges();

    expect(fixture.componentInstance.listError()).toContain('Unable to load');
    listBiasImpactReports.mockReturnValue(of([makeReport()]));
    fixture.componentInstance.retry();
    fixture.detectChanges();

    expect(fixture.componentInstance.listError()).toBeNull();
    expect(fixture.componentInstance.reports().length).toBe(1);
  });

  it('opens the report detail via getBiasImpactReport and can navigate back to the list', () => {
    fixture.componentRef.setInput('executionId', 'execution-1');
    fixture.detectChanges();

    fixture.componentInstance.openDetail('report-1');
    fixture.detectChanges();

    expect(getBiasImpactReport).toHaveBeenCalledWith('report-1');
    expect(fixture.componentInstance.detailMode()).toBe(true);
    expect(fixture.nativeElement.querySelector('app-bias-impact-report-viewer')).not.toBeNull();

    fixture.componentInstance.closeDetail();
    fixture.detectChanges();

    expect(fixture.componentInstance.detailMode()).toBe(false);
  });

  it('shows the same inline message for a report that is missing or not accessible', () => {
    getBiasImpactReport.mockReturnValue(throwError(() => ({ status: 404 })));
    fixture.componentRef.setInput('executionId', 'execution-1');
    fixture.detectChanges();

    fixture.componentInstance.openDetail('missing-report');
    fixture.detectChanges();

    expect(fixture.componentInstance.detailError()).toBe('Report not found or not accessible.');

    getBiasImpactReport.mockReturnValue(throwError(() => ({ status: 403 })));
    fixture.componentInstance.openDetail('someone-elses-report');
    fixture.detectChanges();

    expect(fixture.componentInstance.detailError()).toBe('Report not found or not accessible.');
  });
});
