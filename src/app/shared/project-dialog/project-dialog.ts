import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field, form, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ProjectDialogService } from '@services/dialogs/project-dialog';
import { ModalShellComponent } from '@shared/modal-shell/modal-shell';
import { FormUtility } from '@utilities/form-utility';

/** Host for the create/edit project dialog. Mounted once in app.html. */
@Component({
  selector: 'app-project-dialog',
  imports: [FormsModule, Field, MatButtonModule, MatFormFieldModule, MatInputModule, ModalShellComponent],
  templateUrl: './project-dialog.html',
  styleUrl: './project-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectDialogComponent extends FormUtility {
  private readonly dialog = inject(ProjectDialogService);

  readonly state = this.dialog.state;
  readonly isEdit = computed(() => !!this.state()?.project);

  readonly model = signal({ name: '', description: '' });

  readonly projectForm = form(this.model, (model) => {
    required(model.name, { message: 'Name is required' });
  });

  readonly canSubmit = computed(() => !this.projectForm().invalid());

  constructor() {
    super();
    // Seed the fields whenever the dialog opens, so editing starts from the current values.
    effect(() => {
      const project = this.state()?.project;
      this.model.set({ name: project?.name ?? '', description: project?.description ?? '' });
    });
  }

  cancel(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.dialog.close(null);
  }

  submit(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canSubmit()) return;

    const { name, description } = this.model();
    this.dialog.close({ name: name.trim(), description: description.trim() });
  }
}
