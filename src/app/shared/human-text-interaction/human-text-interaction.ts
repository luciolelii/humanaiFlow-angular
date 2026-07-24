import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HumanInteractionDialogState } from '@services/dialogs/human-interaction-dialog';
import { TemplatePlaceholderTextComponent } from '@shared/template-placeholder-text/template-placeholder-text';

@Component({
  selector: 'app-human-text-interaction',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, TemplatePlaceholderTextComponent],
  templateUrl: './human-text-interaction.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HumanTextInteractionComponent {
  @Input({ required: true }) state!: HumanInteractionDialogState;
  @Output() submitResponse = new EventEmitter<string>();

  draftValue = '';

  canSubmit(): boolean {
    return !this.state.isSubmitting
      && !this.state.isRunning
      && this.draftValue.trim().length > 0;
  }

  submit(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const value = this.draftValue.trim();
    if (!this.canSubmit()) return;
    this.submitResponse.emit(value);
  }
}
