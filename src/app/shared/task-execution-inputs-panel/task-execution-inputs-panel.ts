import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TaskExecutionAuthorizationRequirement } from '@models/task-execution';

export type EditableExecutionInput = {
  key: string;
  nodeId: string;
  inputName: string;
  label: string;
  type: string;
  value: string;
};

@Component({
  selector: 'app-task-execution-inputs-panel',
  imports: [CommonModule, FormsModule],
  templateUrl: './task-execution-inputs-panel.html'
})
export class TaskExecutionInputsPanelComponent {
  readonly editableInputs = input<EditableExecutionInput[]>([]);
  readonly authorizationRequirements = input<TaskExecutionAuthorizationRequirement[]>([]);
  readonly authorizationValues = input<Record<string, string>>({});
  readonly savingAuthorizations = input<Record<string, boolean>>({});
  readonly authorizationErrors = input<Record<string, string>>({});
  readonly savingInputs = input<Record<string, boolean>>({});
  readonly savingErrors = input<Record<string, string>>({});
  readonly readOnly = input<boolean>(false);

  readonly textInputChange = output<{ input: EditableExecutionInput; value: string }>();
  readonly fileInputChange = output<{ input: EditableExecutionInput; file: File }>();
  readonly authorizationValueChange = output<{ requirement: TaskExecutionAuthorizationRequirement; value: string }>();
  readonly authorizationSubmit = output<TaskExecutionAuthorizationRequirement>();

  private readonly authorizationVisibility = new Map<string, boolean>();

  isFileInput(input: EditableExecutionInput): boolean {
    return input.type.includes('FILE') || input.type.includes('BINARY');
  }

  onTextInputChange(input: EditableExecutionInput, value: string) {
    if (this.readOnly()) return;
    this.textInputChange.emit({ input, value });
  }

  onFileInputChange(input: EditableExecutionInput, event: Event) {
    if (this.readOnly()) return;
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) return;
    this.fileInputChange.emit({ input, file });
  }

  isInputSaving(key: string): boolean {
    return this.savingInputs()[key] === true;
  }

  inputSavingError(key: string): string | null {
    return this.savingErrors()[key] ?? null;
  }

  authorizationValue(key: string): string {
    return this.authorizationValues()[key] ?? '';
  }

  onAuthorizationValueChange(requirement: TaskExecutionAuthorizationRequirement, value: string) {
    if (this.readOnly()) return;
    this.authorizationValueChange.emit({ requirement, value });
  }

  submitAuthorization(requirement: TaskExecutionAuthorizationRequirement, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.readOnly() || !this.canSubmitAuthorization(requirement.key)) return;
    this.authorizationSubmit.emit(requirement);
  }

  canSubmitAuthorization(key: string): boolean {
    if (this.readOnly()) return false;
    if (this.isAuthorizationSaving(key)) return false;
    return this.authorizationValue(key).trim().length > 0;
  }

  isAuthorizationSaving(key: string): boolean {
    return this.savingAuthorizations()[key] === true;
  }

  authorizationSavingError(key: string): string | null {
    return this.authorizationErrors()[key] ?? null;
  }

  toggleAuthorizationVisibility(key: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.authorizationVisibility.set(key, !this.isAuthorizationVisible(key));
  }

  isAuthorizationVisible(key: string): boolean {
    return this.authorizationVisibility.get(key) === true;
  }
}
