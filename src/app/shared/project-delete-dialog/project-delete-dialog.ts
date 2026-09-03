import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ProjectDeleteDialogService } from '@services/dialogs/project-delete-dialog';
import { ModalShellComponent } from '@shared/modal-shell/modal-shell';

const MAX_LISTED_FLOWS = 8;

/**
 * Confirmation for a cascading project delete. Deliberately harder to dismiss than an ordinary
 * confirm: it names the count, lists the flows, says that finalized flows go too - which the flow
 * list otherwise forbids - and requires the project name to be typed.
 */
@Component({
  selector: 'app-project-delete-dialog',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, ModalShellComponent],
  templateUrl: './project-delete-dialog.html',
  styleUrl: './project-delete-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectDeleteDialogComponent {
  private readonly dialog = inject(ProjectDeleteDialogService);

  readonly state = this.dialog.state;
  readonly typedName = signal('');

  readonly flowCount = computed(() => this.state()?.flows.length ?? 0);
  readonly finalizedCount = computed(() => this.state()?.flows.filter((flow) => flow.finalized).length ?? 0);
  readonly listedFlows = computed(() => (this.state()?.flows ?? []).slice(0, MAX_LISTED_FLOWS));
  readonly hiddenFlowCount = computed(() => Math.max(0, this.flowCount() - MAX_LISTED_FLOWS));

  readonly headline = computed(() => {
    const project = this.state()?.project;
    if (!project) return '';
    const count = this.flowCount();
    return count === 0
      ? `Delete project “${project.name}”?`
      : `Delete project “${project.name}” and its ${count} ${count === 1 ? 'flow' : 'flows'}?`;
  });

  readonly canConfirm = computed(() => {
    const project = this.state()?.project;
    if (!project) return false;
    // Nothing is destroyed when the project is empty, so typing the name would be busywork.
    if (this.flowCount() === 0) return true;
    return this.typedName().trim() === project.name;
  });

  constructor() {
    // Clear the typed name each time the dialog opens, so a previous confirmation cannot carry over.
    effect(() => {
      this.state();
      this.typedName.set('');
    });
  }

  cancel() {
    this.dialog.close(false);
  }

  confirm() {
    if (!this.canConfirm()) return;
    this.dialog.close(true);
  }
}
