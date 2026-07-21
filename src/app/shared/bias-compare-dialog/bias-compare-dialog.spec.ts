import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BiasCompareDialogHostComponent } from './bias-compare-dialog';
import { BiasCompareDialogService } from '@services/dialogs/bias-compare-dialog';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
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
    baselineOutput: { output: 'baseline' },
    biasedOutputs: [{ output: 'variant' }]
  },
  downstreamImpact: [],
  routingChanges: [],
  mockedSideEffects: [],
  summary: 'Outputs changed',
  warnings: []
};

describe('BiasCompareDialogHostComponent', () => {
  let fixture: ComponentFixture<BiasCompareDialogHostComponent>;
  let dialog: BiasCompareDialogService;
  let compareBiasExecutions: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    compareBiasExecutions = vi.fn().mockReturnValue(of(REPORT));
    await TestBed.configureTestingModule({
      imports: [BiasCompareDialogHostComponent],
      providers: [
        { provide: TaskExecutionsService, useValue: { compareBiasExecutions } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BiasCompareDialogHostComponent);
    dialog = TestBed.inject(BiasCompareDialogService);
  });

  it('triggers the compare call on open and shows the resulting report', () => {
    fixture.detectChanges();
    dialog.open({ baselineExecutionId: 'baseline-1', biasedExecutionId: 'variant-1' });
    fixture.detectChanges();

    expect(compareBiasExecutions).toHaveBeenCalledWith('baseline-1', 'variant-1', true);
    expect(fixture.componentInstance.report()).toEqual(REPORT);
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-bias-impact-report-viewer')).not.toBeNull();
  });

  it('shows the backend errors[].message inline when the compare is rejected', () => {
    compareBiasExecutions.mockReturnValue(throwError(() => ({
      status: 400,
      error: { detail: 'generic', errors: [{ code: 'BIAS_EXECUTION_NOT_FINAL', message: 'The variant has not finished yet.' }] }
    })));
    fixture.detectChanges();
    dialog.open({ baselineExecutionId: 'baseline-1', biasedExecutionId: 'variant-1' });
    fixture.detectChanges();

    expect(fixture.componentInstance.inlineError()).toBe('The variant has not finished yet.');
    expect(fixture.componentInstance.report()).toBeNull();
  });

  it('retries the same comparison and clears the error on success', () => {
    compareBiasExecutions.mockReturnValue(throwError(() => ({ status: 0 })));
    fixture.detectChanges();
    dialog.open({ baselineExecutionId: 'baseline-1', biasedExecutionId: 'variant-1' });
    fixture.detectChanges();
    expect(fixture.componentInstance.inlineError()).not.toBeNull();

    compareBiasExecutions.mockReturnValue(of(REPORT));
    fixture.componentInstance.retry();
    fixture.detectChanges();

    expect(compareBiasExecutions).toHaveBeenLastCalledWith('baseline-1', 'variant-1', true);
    expect(fixture.componentInstance.inlineError()).toBeNull();
    expect(fixture.componentInstance.report()).toEqual(REPORT);
  });

  it('resets state and closes the dialog', () => {
    fixture.detectChanges();
    dialog.open({ baselineExecutionId: 'baseline-1', biasedExecutionId: 'variant-1' });
    fixture.detectChanges();

    fixture.componentInstance.close();
    fixture.detectChanges();

    expect(dialog.state()).toBeNull();
  });
});
