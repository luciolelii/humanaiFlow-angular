import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  HumanInteractionDialogResult,
  HumanInteractionDialogState
} from '@services/dialogs/human-interaction-dialog';

@Component({
  selector: 'app-human-decision-interaction',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './human-decision-interaction.html',
  styleUrl: './human-decision-interaction.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HumanDecisionInteractionComponent {
  @Input({ required: true }) state!: HumanInteractionDialogState;
  @Output() submitDecision = new EventEmitter<Extract<HumanInteractionDialogResult, { mode: 'decision' }>>();

  selectedChoice = '';
  rationale = '';

  selectChoice(name: string) {
    if (this.state.isSubmitting || this.state.isRunning) return;
    this.selectedChoice = name;
  }

  canSubmit(): boolean {
    if (this.state.isSubmitting || this.state.isRunning) return false;
    if (this.state.decisionOptions.length < 2 || this.state.decisionOptions.length > 10) return false;
    if (!this.state.decisionOptions.some((option) => option.name === this.selectedChoice)) return false;
    return !this.state.rationaleRequired || this.rationale.trim().length > 0;
  }

  submit(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canSubmit()) return;
    this.submitDecision.emit({
      mode: 'decision',
      choice: this.selectedChoice,
      rationale: this.rationale.trim()
    });
  }
}
