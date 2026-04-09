import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TaskExecutionAuthorizationRequirement } from '@models/task-execution';

export type EditableExecutionInput = {
  key: string;
  scope: 'global' | 'node';
  nodeId: string | null;
  inputName: string;
  title: string;
  subtitle: string;
  type: string;
  multiple: boolean;
  value: string | string[];
};

@Component({
  selector: 'app-task-execution-inputs-panel',
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './task-execution-inputs-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush
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

  readonly textInputChange = output<{ input: EditableExecutionInput; value: string | string[] }>();
  readonly textInputSubmit = output<EditableExecutionInput>();
  readonly fileInputChange = output<{ input: EditableExecutionInput; files: File[] }>();
  readonly authorizationValueChange = output<{ requirement: TaskExecutionAuthorizationRequirement; value: string }>();
  readonly authorizationSubmit = output<TaskExecutionAuthorizationRequirement>();
  readonly globalExecutionInputs = computed(() => this.editableInputs().filter((input) => input.scope === 'global'));
  readonly nodeExecutionInputs = computed(() => this.editableInputs().filter((input) => input.scope === 'node'));

  private readonly authorizationVisibility = new Map<string, boolean>();

  isFileInput(input: EditableExecutionInput): boolean {
    return input.type.includes('FILE') || input.type.includes('BINARY');
  }

  isMultipleInput(input: EditableExecutionInput): boolean {
    return input.multiple;
  }

  textValues(input: EditableExecutionInput): string[] {
    if (Array.isArray(input.value)) {
      return input.value;
    }
    return [input.value ?? ''];
  }

  onTextInputChange(input: EditableExecutionInput, value: string | string[]) {
    if (this.readOnly()) return;
    this.textInputChange.emit({ input, value });
  }

  submitTextInput(input: EditableExecutionInput, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.readOnly() || this.isInputSaving(input.key)) return;
    this.textInputSubmit.emit(input);
  }

  onFileInputChange(input: EditableExecutionInput, event: Event) {
    if (this.readOnly()) return;
    const target = event.target as HTMLInputElement | null;
    const files = target?.files ? Array.from(target.files) : [];
    if (!files.length) return;
    this.fileInputChange.emit({ input, files });
  }

  addTextItem(input: EditableExecutionInput) {
    const values = [...this.textValues(input), ''];
    this.onTextInputChange(input, values);
  }

  updateTextItem(input: EditableExecutionInput, index: number, value: string) {
    const values = [...this.textValues(input)];
    values[index] = value;
    this.onTextInputChange(input, values);
  }

  removeTextItem(input: EditableExecutionInput, index: number) {
    const values = [...this.textValues(input)];
    values.splice(index, 1);
    this.onTextInputChange(input, values);
  }

  inputTypeLabel(input: EditableExecutionInput): string {
    return input.multiple ? `${input.type}[]` : input.type;
  }

  isInputSaving(key: string): boolean {
    return this.savingInputs()[key] === true;
  }

  canSubmitTextInput(input: EditableExecutionInput): boolean {
    return !this.readOnly() && !this.isInputSaving(input.key);
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
