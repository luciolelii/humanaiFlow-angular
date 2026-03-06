import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

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
  readonly savingInputs = input<Record<string, boolean>>({});
  readonly savingErrors = input<Record<string, string>>({});
  readonly readOnly = input<boolean>(false);

  readonly textInputChange = output<{ input: EditableExecutionInput; value: string }>();
  readonly fileInputChange = output<{ input: EditableExecutionInput; file: File }>();

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
}
