import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ModalShellComponent } from '@shared/modal-shell/modal-shell';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TaskExecutionAuthorizationRequirement } from '@models/task-execution';

export type JsonArrayParseResult =
  | { values: string[]; error: null }
  | { values: null; error: string };

/**
 * Parses the pasted text into the items of a multi-value input.
 *
 * Deliberately strict about what it accepts, and specific about what it rejects: the point of the
 * dialog is to save typing, so a silent misread would be worse than typing the items by hand.
 */
export function parseJsonArrayInput(text: string): JsonArrayParseResult {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return { values: null, error: 'Paste a JSON array first.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { values: null, error: `Not valid JSON: ${(error as Error).message}` };
  }

  if (!Array.isArray(parsed)) {
    return { values: null, error: 'Expected a JSON array, for example ["first", "second"].' };
  }
  if (!parsed.length) {
    return { values: null, error: 'The array is empty, so there is nothing to import.' };
  }

  const values: string[] = [];
  for (let index = 0; index < parsed.length; index++) {
    const item = parsed[index];
    if (item === null || typeof item === 'object') {
      return {
        values: null,
        error: `Every item must be a text value; item ${index + 1} is ${Array.isArray(item)
          ? 'an array'
          : item === null ? 'null' : 'an object'}.`
      };
    }
    values.push(String(item));
  }

  return { values, error: null };
}

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
  /**
   * Whether a value is actually stored in the execution - unsaved edits do not count. Node inputs
   * gate the start just as globals do: a step without its manual input never reaches READY.
   */
  provided: boolean;
};

@Component({
  selector: 'app-task-execution-inputs-panel',
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule, ModalShellComponent],
  templateUrl: './task-execution-inputs-panel.html',
  styleUrl: './task-execution-inputs-panel.css',
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
  /** Keys the user has edited but not saved; drives the single Save at the foot of the panel. */
  readonly pendingKeys = input<string[]>([]);
  /**
   * One message for a save that failed as a whole. The globals go in a single request, so a failure
   * is not attributable to any one of them - repeating it on each field said the same thing N times
   * and implied N separate problems.
   */
  readonly saveError = input<string | null>(null);


  readonly textInputChange = output<{ input: EditableExecutionInput; value: string | string[] }>();
  readonly textInputSubmit = output<EditableExecutionInput>();
  readonly fileInputChange = output<{ input: EditableExecutionInput; files: File[] }>();
  readonly authorizationValueChange = output<{ requirement: TaskExecutionAuthorizationRequirement; value: string }>();
  readonly authorizationSubmit = output<TaskExecutionAuthorizationRequirement>();
  readonly submitAllInputs = output<void>();
  readonly globalExecutionInputs = computed(() => this.editableInputs().filter((input) => input.scope === 'global'));
  readonly nodeExecutionInputs = computed(() => this.editableInputs().filter((input) => input.scope === 'node'));

  private readonly authorizationVisibility = new Map<string, boolean>();

  private readonly pendingKeySet = computed(() => new Set(this.pendingKeys()));

  readonly pendingCount = computed(() => this.editableInputs()
    .filter((input) => this.pendingKeySet().has(input.key)).length);

  readonly anySaving = computed(() => Object.values(this.savingInputs()).some(Boolean));

  readonly canSubmitAll = computed(() =>
    !this.readOnly() && this.pendingCount() > 0 && !this.anySaving());

  /** Every manual input is required, node ones included, so the count covers the whole panel. */
  readonly providedCount = computed(() => this.editableInputs().filter((input) => input.provided).length);

  readonly globalMissingCount = computed(() =>
    this.globalExecutionInputs().filter((input) => !input.provided).length);
  readonly nodeMissingCount = computed(() =>
    this.nodeExecutionInputs().filter((input) => !input.provided).length);

  /**
   * Null until the user decides for themselves; until then a group is open exactly when something
   * in it is still missing, so what needs attention is what you see.
   */
  private readonly globalsOverride = signal<boolean | null>(null);
  private readonly nodesOverride = signal<boolean | null>(null);

  readonly globalsOpen = computed(() => this.globalsOverride() ?? this.globalMissingCount() > 0);
  readonly nodesOpen = computed(() => this.nodesOverride() ?? this.nodeMissingCount() > 0);

  toggleGlobals() {
    this.globalsOverride.set(!this.globalsOpen());
  }

  toggleNodes() {
    this.nodesOverride.set(!this.nodesOpen());
  }

  /**
   * A list input is folded once it is satisfied and unfolded while it still needs attention - the
   * same rule the two groups follow. Five long answers otherwise fill the whole aside on their own.
   */
  private readonly itemsOverrides = signal<Record<string, boolean>>({});

  itemsOpen(input: EditableExecutionInput): boolean {
    return this.itemsOverrides()[input.key] ?? !input.provided;
  }

  toggleItems(input: EditableExecutionInput, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.itemsOverrides.update((current) => ({ ...current, [input.key]: !this.itemsOpen(input) }));
  }

  itemCountLabel(input: EditableExecutionInput): string {
    const count = this.textValues(input).length;
    return count === 1 ? '1 item' : `${count} items`;
  }

  /** A list of texts: the file inputs are multiple too, but the browser picker handles those. */
  isListInput(input: EditableExecutionInput): boolean {
    return this.isMultipleInput(input) && !this.isFileInput(input);
  }

  /**
   * The value being edited in the large box: `index` names one item of a list input, null the
   * whole single-valued input.
   */
  readonly editorTarget = signal<{ input: EditableExecutionInput; index: number | null } | null>(null);
  readonly editorText = signal('');

  readonly editorSubtitle = computed(() => {
    const target = this.editorTarget();
    if (!target) return null;
    return target.index === null
      ? `Value of ${target.input.subtitle}.`
      : `Item ${target.index + 1} of ${target.input.subtitle}.`;
  });

  openEditor(input: EditableExecutionInput, index: number | null, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const current = index === null
      ? (Array.isArray(input.value) ? input.value.join('\n') : input.value ?? '')
      : this.textValues(input)[index] ?? '';
    this.editorTarget.set({ input, index });
    this.editorText.set(current);
  }

  closeEditor() {
    this.editorTarget.set(null);
  }

  applyEditor() {
    const target = this.editorTarget();
    if (!target || this.readOnly()) return;

    // Routed through the ordinary edit path, so the box is only a bigger way to type: the panel's
    // single Save still decides when the value is sent.
    const input = this.liveInput(target.input);
    if (target.index === null) {
      this.onTextInputChange(input, this.editorText());
    } else {
      this.updateTextItem(input, target.index, this.editorText());
    }
    this.closeEditor();
  }

  readonly importTarget = signal<EditableExecutionInput | null>(null);
  readonly importText = signal('');
  readonly importError = signal<string | null>(null);

  openImport(input: EditableExecutionInput, event: Event) {
    event.stopPropagation();
    if (this.readOnly()) return;
    this.importTarget.set(input);
    this.importText.set('');
    this.importError.set(null);
  }

  closeImport() {
    this.importTarget.set(null);
  }

  applyImport() {
    const input = this.importTarget();
    if (!input) return;

    const result = parseJsonArrayInput(this.importText());
    if (result.error !== null) {
      this.importError.set(result.error);
      return;
    }

    // Emitted like any other edit, so the imported items land in the panel's single Save rather
    // than being written straight through.
    this.onTextInputChange(this.liveInput(input), result.values);
    this.closeImport();
  }

  /**
   * The current copy of an input the dialogs were opened on. `editableInputs` is rebuilt on every
   * poll, so the captured object can be a stale snapshot to rebase an edit onto.
   */
  private liveInput(input: EditableExecutionInput): EditableExecutionInput {
    return this.editableInputs().find((candidate) => candidate.key === input.key) ?? input;
  }

  isPending(input: EditableExecutionInput): boolean {
    return this.pendingKeySet().has(input.key);
  }

  isMissing(input: EditableExecutionInput): boolean {
    return !input.provided;
  }

  submitAll(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canSubmitAll()) return;
    this.submitAllInputs.emit();
  }

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
