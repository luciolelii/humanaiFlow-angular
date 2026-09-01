import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { BiasInterventionDirection, ExternalSideEffectPolicy } from '@models/bias-impact';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import {
  BiasRerunDialogService,
  buildBiasRerunActivations
} from '@services/dialogs/bias-rerun-dialog';
import { extractBiasErrorMessage } from '@services/bias/bias-error.util';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { SideEffectPolicySelectorComponent } from '@shared/side-effect-policy-selector/side-effect-policy-selector';
import { ModalShellComponent } from '@shared/modal-shell/modal-shell';

@Component({
  selector: 'app-bias-rerun-dialog-host',
  standalone: true,
  imports: [FormsModule, MatButtonModule, SideEffectPolicySelectorComponent, ModalShellComponent],
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
  readonly selectedSubflowsByNode = signal<Record<string, boolean>>({});
  readonly policy = signal<ExternalSideEffectPolicy>('BLOCK');
  readonly direction = signal<BiasInterventionDirection>('BIAS');
  readonly creating = signal(false);
  readonly inlineError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const state = this.state();
      this.selectedAnnotationIdsByNode.set(Object.fromEntries((state?.candidates ?? []).map((candidate) => [candidate.nodeId, []])));
      this.selectedSubflowsByNode.set(Object.fromEntries(
        (state?.candidates ?? [])
          .filter((candidate) => candidate.activationKind === 'SUBFLOW')
          .map((candidate) => [candidate.nodeId, false])
      ));
      this.policy.set('BLOCK');
      this.direction.set('BIAS');
      this.creating.set(false);
      this.inlineError.set(null);
    });
  }

  selectedIds(nodeId: string): string[] { return this.selectedAnnotationIdsByNode()[nodeId] ?? []; }

  eligibleAnnotations(candidate: any) {
    const direction = this.direction();
    return candidate.annotations.filter((annotation: any) => direction === 'BIAS' ? !!annotation.biasProbe : direction === 'MITIGATION' ? !!annotation.mitigationProbe : !!annotation.biasProbe && !!annotation.mitigationProbe);
  }

  toggleAnnotation(nodeId: string, annotationId: string, checked: boolean) {
    this.selectedAnnotationIdsByNode.update((current) => {
      const selected = new Set(current[nodeId] ?? []);
      if (checked) selected.add(annotationId); else selected.delete(annotationId);
      return { ...current, [nodeId]: [...selected] };
    });
  }

  subflowSelected(nodeId: string): boolean {
    return this.selectedSubflowsByNode()[nodeId] === true;
  }

  toggleSubflow(nodeId: string, checked: boolean) {
    this.selectedSubflowsByNode.update((current) => ({ ...current, [nodeId]: checked }));
  }

  hasExternalSideEffects(): boolean {
    return (this.state()?.candidates ?? []).some((candidate) => {
      const selected = candidate.activationKind === 'SUBFLOW'
        ? this.subflowSelected(candidate.nodeId)
        : this.selectedIds(candidate.nodeId).length > 0;
      return selected && candidate.capabilities.externalSideEffects;
    });
  }

  async submit() {
    const state = this.state();
    if (!state || this.creating()) return;
    const activations = buildBiasRerunActivations(
      state.candidates,
      this.selectedAnnotationIdsByNode(),
      this.selectedSubflowsByNode()
      , this.direction()
    );
    if (!activations.length) {
      this.inlineError.set('Select at least one executable annotation or container subflow.');
      return;
    }

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
        this.inlineError.set(extractBiasErrorMessage(error, 'Unable to create the biased rerun.'));
      }
    });
  }

  setDirection(direction: BiasInterventionDirection) {
    this.direction.set(direction);
    this.selectedAnnotationIdsByNode.update((current) => {
      const next = { ...current };
      for (const candidate of this.state()?.candidates ?? []) {
        const allowed = new Set(this.eligibleAnnotations(candidate).map((annotation: any) => String(annotation.id ?? '')));
        next[candidate.nodeId] = (next[candidate.nodeId] ?? []).filter((id) => allowed.has(id));
      }
      return next;
    });
  }

  close() { if (!this.creating()) this.dialog.close(); }
}
