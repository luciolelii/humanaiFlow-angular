import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { BiasImpactReportViewerComponent } from '@shared/bias-impact-report-viewer/bias-impact-report-viewer';
import { SideEffectPolicySelectorComponent } from '@shared/side-effect-policy-selector/side-effect-policy-selector';
import { ModalShellComponent } from '@shared/modal-shell/modal-shell';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { BiasImpactExperimentDialogService } from '@services/dialogs/bias-impact-experiment-dialog';
import { BiasComparisonViewStateService } from '@services/bias/bias-comparison-view-state';
import { extractBiasErrorMessage } from '@services/bias/bias-error.util';
import { NotificationService } from '@services/notifications/notification';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { BiasImpactJob, BiasImpactReport, BiasInterventionDirection, ExternalSideEffectPolicy } from '@models/bias-impact';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-bias-impact-experiment-dialog-host',
  standalone: true,
  imports: [FormsModule, MatButtonModule, BiasImpactReportViewerComponent, SideEffectPolicySelectorComponent, ModalShellComponent],
  templateUrl: './bias-impact-experiment-dialog.html',
  styleUrl: './bias-impact-experiment-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BiasImpactExperimentDialogHostComponent {
  private readonly dialog = inject(BiasImpactExperimentDialogService);
  private readonly executions = inject(TaskExecutionsService);
  private readonly confirmation = inject(ConfirmDialogService);
  private readonly notifications = inject(NotificationService);
  private readonly comparisonViewState = inject(BiasComparisonViewStateService);
  private readonly destroyRef = inject(DestroyRef);
  private pollSubscription: Subscription | null = null;

  readonly state = this.dialog.state;
  readonly selectedAnnotationIds = signal<string[]>([]);
  readonly direction = signal<BiasInterventionDirection>('BIAS');
  readonly repetitions = signal(3);
  readonly includeRawOutputs = signal(true);
  readonly policy = signal<ExternalSideEffectPolicy>('BLOCK');
  readonly submitting = signal(false);
  readonly currentJob = signal<BiasImpactJob | null>(null);
  readonly inlineError = signal<string | null>(null);
  readonly report = signal<BiasImpactReport | null>(null);

  constructor() {
    effect(() => {
      const state = this.state();
      this.cancelPolling();
      this.selectedAnnotationIds.set(state?.annotations.map((annotation) => String(annotation.id ?? '')).filter(Boolean) ?? []);
      this.direction.set('BIAS');
      this.repetitions.set(3);
      this.includeRawOutputs.set(true);
      this.policy.set('BLOCK');
      this.submitting.set(false);
      this.currentJob.set(null);
      this.inlineError.set(null);
      this.report.set(null);
    });
    this.destroyRef.onDestroy(() => this.cancelPolling());
  }

  toggleAnnotation(id: string, checked: boolean) {
    this.selectedAnnotationIds.update((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));
  }

  eligibleAnnotations() {
    const direction = this.direction();
    return (this.state()?.annotations ?? []).filter((annotation) =>
      direction === 'BIAS' ? !!annotation.biasProbe :
      direction === 'MITIGATION' ? !!annotation.mitigationProbe : !!annotation.biasProbe && !!annotation.mitigationProbe
    );
  }

  setDirection(direction: BiasInterventionDirection) {
    this.direction.set(direction);
    const allowed = new Set(this.eligibleAnnotations().map((annotation) => String(annotation.id ?? '')));
    this.selectedAnnotationIds.update((ids) => ids.filter((id) => allowed.has(id)));
  }

  updateRepetitions(value: number) {
    this.repetitions.set(Math.min(10, Math.max(1, Number.isFinite(value) ? Math.round(value) : 3)));
  }

  async submit() {
    const state = this.state();
    if (!state || this.submitting() || this.currentJob()) return;
    if (!this.selectedAnnotationIds().length) {
      this.inlineError.set('Select at least one executable bias annotation.');
      return;
    }

    let confirmExternalSideEffects = false;
    if (this.policy() === 'REQUIRE_CONFIRMATION') {
      confirmExternalSideEffects = await this.confirmation.open('This experiment may invoke real external HTTP or MCP calls. Do you want to continue?');
      if (!confirmExternalSideEffects) return;
    }

    this.submitting.set(true);
    this.inlineError.set(null);
    this.executions.runBiasImpactExperiment(state.executionId, state.stepId, {
      annotationIds: this.selectedAnnotationIds(),
      direction: this.direction(),
      repetitions: this.repetitions(),
      includeRawOutputs: this.includeRawOutputs(),
      externalSideEffectPolicy: this.policy(),
      confirmExternalSideEffects
    }).subscribe({
      next: (job) => this.startPolling(job),
      error: (error) => this.handleInitialError(error)
    });
  }

  close() {
    this.cancelPolling();
    this.dialog.close();
  }

  highlightOnCanvas() {
    const report = this.report();
    if (!report) return;
    this.comparisonViewState.show({ report });
    this.close();
  }

  private startPolling(job: BiasImpactJob) {
    this.currentJob.set(job);
    this.pollSubscription = this.executions.pollBiasImpactJob(job.id).subscribe({
      next: (nextJob) => {
        this.currentJob.set(nextJob);
        if (!nextJob.terminal) return;
        this.submitting.set(false);
        this.cancelPolling();
        if (nextJob.status === 'COMPLETED' && nextJob.report) this.report.set(nextJob.report);
        else this.inlineError.set(nextJob.errorMessage || 'The bias impact experiment failed.');
      },
      error: (error) => {
        this.submitting.set(false);
        this.currentJob.set(null);
        this.inlineError.set(extractBiasErrorMessage(error, 'Unable to retrieve the experiment status.'));
      }
    });
  }

  private handleInitialError(error: unknown) {
    this.submitting.set(false);
    const status = (error as { status?: number })?.status;
    if (status === 404 || status === 400) {
      this.notifications.show(extractBiasErrorMessage(error, 'The execution is no longer eligible for this experiment.'), 'error');
      this.close();
      return;
    }
    this.inlineError.set(extractBiasErrorMessage(error, 'Unable to start the bias impact experiment.'));
  }

  private cancelPolling() {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = null;
  }
}
