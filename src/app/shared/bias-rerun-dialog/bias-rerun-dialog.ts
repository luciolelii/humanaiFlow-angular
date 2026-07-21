import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ExternalSideEffectPolicy, BiasSideEffectError } from '@models/bias-impact';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { BiasRerunDialogService } from '@services/dialogs/bias-rerun-dialog';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { SideEffectPolicySelectorComponent } from '@shared/side-effect-policy-selector/side-effect-policy-selector';

@Component({
  selector: 'app-bias-rerun-dialog-host',
  standalone: true,
  imports: [FormsModule, MatButtonModule, SideEffectPolicySelectorComponent],
  templateUrl: './bias-rerun-dialog.html',
  styleUrl: './bias-rerun-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BiasRerunDialogHostComponent {
  private readonly dialog = inject(BiasRerunDialogService);
  private readonly executions = inject(TaskExecutionsService);
  private readonly confirmation = inject(ConfirmDialogService);
  readonly state = this.dialog.state;
  readonly selectedAnnotationIdsByNode = signal<Record<string, string[]>>({});
  readonly policy = signal<ExternalSideEffectPolicy>('BLOCK');
  readonly creating = signal(false);
  readonly inlineError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const state = this.state();
      this.selectedAnnotationIdsByNode.set(Object.fromEntries((state?.candidates ?? []).map((candidate) => [candidate.nodeId, []])));
      this.policy.set('BLOCK');
      this.creating.set(false);
      this.inlineError.set(null);
    });
  }

  selectedIds(nodeId: string): string[] { return this.selectedAnnotationIdsByNode()[nodeId] ?? []; }

  toggleAnnotation(nodeId: string, annotationId: string, checked: boolean) {
    this.selectedAnnotationIdsByNode.update((current) => {
      const selected = new Set(current[nodeId] ?? []);
      if (checked) selected.add(annotationId); else selected.delete(annotationId);
      return { ...current, [nodeId]: [...selected] };
    });
  }

  hasExternalSideEffects(): boolean {
    return (this.state()?.candidates ?? []).some((candidate) => this.selectedIds(candidate.nodeId).length > 0 && candidate.capabilities.externalSideEffects);
  }

  async submit() {
    const state = this.state();
    if (!state || this.creating()) return;
    const activations = Object.entries(this.selectedAnnotationIdsByNode())
      .filter(([, annotationIds]) => annotationIds.length > 0)
      .map(([nodeId, annotationIds]) => ({ nodeId, annotationIds }));
    if (!activations.length) { this.inlineError.set('Select at least one executable annotation.'); return; }

    let confirmExternalSideEffects = false;
    if (this.policy() === 'REQUIRE_CONFIRMATION') {
      confirmExternalSideEffects = await this.confirmation.open('This biased rerun may invoke real external HTTP or MCP calls. Do you want to continue?');
      if (!confirmExternalSideEffects) return;
    }
    this.creating.set(true);
    this.inlineError.set(null);
    this.executions.createBiasedRerun(state.executionId, { activations, externalSideEffectPolicy: this.policy(), confirmExternalSideEffects }).subscribe({
      next: (execution) => { state.onCreated(execution); this.dialog.close(); },
      error: (error) => {
        this.creating.set(false);
        const sideEffectError = error as Partial<BiasSideEffectError>;
        this.inlineError.set(sideEffectError.reason === 'SIDE_EFFECT_BLOCKED' || sideEffectError.reason === 'CONFIRMATION_REQUIRED'
          ? sideEffectError.message ?? 'External side effect policy prevented the rerun.'
          : error instanceof Error ? error.message : 'Unable to create the biased rerun.');
      }
    });
  }

  close() { if (!this.creating()) this.dialog.close(); }
}
