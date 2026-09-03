import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { BiasImpactReportViewerComponent } from '@shared/bias-impact-report-viewer/bias-impact-report-viewer';
import { ModalShellComponent } from '@shared/modal-shell/modal-shell';
import { BiasCompareDialogService } from '@services/dialogs/bias-compare-dialog';
import { BiasComparisonViewStateService } from '@services/bias/bias-comparison-view-state';
import { BiasReportsRevisionService } from '@services/bias/bias-reports-revision';
import { extractBiasErrorMessage } from '@services/bias/bias-error.util';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { BiasImpactReport } from '@models/bias-impact';

@Component({
  selector: 'app-bias-compare-dialog-host',
  standalone: true,
  imports: [MatButtonModule, BiasImpactReportViewerComponent, ModalShellComponent],
  templateUrl: './bias-compare-dialog.html',
  styleUrl: './bias-compare-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BiasCompareDialogHostComponent {
  private readonly dialog = inject(BiasCompareDialogService);
  private readonly executions = inject(TaskExecutionsService);
  private readonly comparisonViewState = inject(BiasComparisonViewStateService);
  private readonly reportsRevision = inject(BiasReportsRevisionService);

  readonly state = this.dialog.state;
  readonly loading = signal(false);
  readonly inlineError = signal<string | null>(null);
  readonly report = signal<BiasImpactReport | null>(null);

  constructor() {
    effect(() => {
      const state = this.state();
      this.report.set(null);
      this.inlineError.set(null);
      this.loading.set(false);
      if (!state) return;

      this.runCompare(state.baselineExecutionId, state.biasedExecutionId);
    });
  }

  retry() {
    const state = this.state();
    if (!state) return;
    this.runCompare(state.baselineExecutionId, state.biasedExecutionId);
  }

  close() {
    this.dialog.close();
  }

  highlightOnCanvas() {
    const report = this.report();
    if (!report) return;
    this.comparisonViewState.show({ report });
    this.close();
  }

  private runCompare(baselineExecutionId: string, biasedExecutionId: string) {
    this.inlineError.set(null);
    this.loading.set(true);
    this.executions.compareBiasExecutions(baselineExecutionId, biasedExecutionId, true).subscribe({
      next: (report) => {
        this.loading.set(false);
        this.report.set(report);
        // The comparison is persisted server-side, so it is a new row the tab behind should list.
        this.reportsRevision.reportProduced();
      },
      error: (error) => {
        this.loading.set(false);
        this.inlineError.set(extractBiasErrorMessage(error, 'Unable to compare the baseline and biased executions.'));
      }
    });
  }
}
