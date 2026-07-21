import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { BiasImpactReport } from '@models/bias-impact';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { BiasComparisonViewStateService } from '@services/bias/bias-comparison-view-state';
import { BiasImpactReportViewerComponent } from '@shared/bias-impact-report-viewer/bias-impact-report-viewer';

@Component({
  selector: 'app-bias-impact-report-list',
  standalone: true,
  imports: [CommonModule, MatButtonModule, BiasImpactReportViewerComponent],
  templateUrl: './bias-impact-report-list.html',
  styleUrl: './bias-impact-report-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BiasImpactReportListComponent {
  private readonly executions = inject(TaskExecutionsService);
  private readonly comparisonViewState = inject(BiasComparisonViewStateService);
  private lastExecutionId: string | null = null;

  readonly executionId = input<string | null>(null);

  readonly reports = signal<BiasImpactReport[]>([]);
  readonly loading = signal(false);
  readonly listError = signal<string | null>(null);

  readonly selectedReport = signal<BiasImpactReport | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal<string | null>(null);

  readonly detailMode = computed(() =>
    this.selectedReport() !== null || this.detailLoading() || this.detailError() !== null
  );

  constructor() {
    effect(() => {
      const executionId = this.executionId();
      if (executionId === this.lastExecutionId) return;
      this.lastExecutionId = executionId;
      this.closeDetail();
      this.loadReports(executionId);
    });
  }

  retry() {
    this.loadReports(this.executionId());
  }

  openDetail(reportId: string) {
    this.selectedReport.set(null);
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.executions.getBiasImpactReport(reportId).subscribe({
      next: (report) => {
        this.detailLoading.set(false);
        this.selectedReport.set(report);
      },
      error: () => {
        this.detailLoading.set(false);
        this.detailError.set('Report not found or not accessible.');
      }
    });
  }

  closeDetail() {
    this.selectedReport.set(null);
    this.detailLoading.set(false);
    this.detailError.set(null);
  }

  highlightOnCanvas() {
    const report = this.selectedReport();
    if (!report) return;
    this.comparisonViewState.show({ report });
  }

  annotationCount(report: BiasImpactReport): number {
    return report.annotationIds?.length ?? 0;
  }

  private loadReports(executionId: string | null) {
    if (!executionId) {
      this.reports.set([]);
      this.listError.set(null);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.listError.set(null);
    this.executions.listBiasImpactReports(executionId).subscribe({
      next: (reports) => {
        this.loading.set(false);
        this.reports.set(reports);
      },
      error: () => {
        this.loading.set(false);
        this.listError.set('Unable to load the bias impact reports for this execution.');
      }
    });
  }
}
