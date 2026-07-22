import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, effect, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BiasAnnotation,
  BiasAnnotationOption,
  BiasAnnotationsDescriptor,
  BehavioralProbe,
  FlowNode,
  FlowValidationError,
  isProbeExecutable
} from '@models/flow';
import { BIAS_PROBE_ERROR_CODES } from '@models/bias-impact';
import { BlocksService } from '@services/blocks/blocks';
import { EditorStateHolder } from '@stores/flow-editor';
import { BehavioralProbeEditorComponent } from '@shared/behavioral-probe-editor/behavioral-probe-editor';

type BiasField = {
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  widget?: string;
  maxLength?: number;
  required: boolean;
  options: BiasAnnotationOption[];
};

const BIAS_ERROR_CODES = new Set([
  'TOO_MANY_BIAS_ANNOTATIONS', 'NULL_BIAS_ANNOTATION', 'DUPLICATE_BIAS_ANNOTATION_ID',
  'BIAS_CATEGORY_REQUIRED', 'BIAS_SEVERITY_REQUIRED', 'BIAS_ISSUE_REQUIRED', 'BIAS_FIELD_TOO_LONG',
  ...BIAS_PROBE_ERROR_CODES
]);

@Component({
  selector: 'app-bias-annotations',
  standalone: true,
  imports: [CommonModule, FormsModule, BehavioralProbeEditorComponent],
  templateUrl: './bias-annotations.html',
  styleUrl: './bias-annotations.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BiasAnnotationsComponent {
  private readonly blocks = inject(BlocksService);
  private readonly editorState = inject(EditorStateHolder);

  @Input({ required: true }) blockId = '';
  @Input() block: FlowNode | null = null;
  @Input() annotations: BiasAnnotation[] = [];
  @Input() readonly = false;
  @Output() annotationsChange = new EventEmitter<BiasAnnotation[]>();

  editorOpen = false;
  editingIndex: number | null = null;
  draft: BiasAnnotation = {};
  clientErrors: Record<string, string> = {};

  /**
   * The editor renders inside a node card, which rete.js positions with a CSS
   * `transform` for pan/zoom. A `transform` on any ancestor turns it into the
   * containing block for `position: fixed` descendants, so a plain fixed-position
   * backdrop would be confined to the node's box instead of covering the page.
   * A native `<dialog>` opened via `showModal()` is promoted to the browser's
   * top layer, which sits above the whole document regardless of ancestor
   * transforms — no manual DOM reparenting needed.
   */
  private readonly modalDialog = viewChild<ElementRef<HTMLDialogElement>>('biasModalDialog');

  constructor() {
    effect(() => {
      const dialog = this.modalDialog()?.nativeElement;
      if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
        dialog.showModal();
      }
    });
  }

  onDialogClick(event: MouseEvent) {
    if (event.target === this.modalDialog()?.nativeElement) {
      this.close(event);
    }
  }

  get descriptor(): BiasAnnotationsDescriptor | null {
    const descriptorSignal = (this.blocks as BlocksService & {
      biasAnnotationsDescriptor?: () => BiasAnnotationsDescriptor | null
    }).biasAnnotationsDescriptor;
    return typeof descriptorSignal === 'function' ? descriptorSignal() : null;
  }

  get fields(): BiasField[] {
    const descriptor = this.descriptor;
    const descriptorSchema = descriptor?.schema ?? {};
    const schema = descriptorSchema['type'] === 'array'
      ? this.record(descriptorSchema['items'])
      : descriptorSchema;
    const properties = this.record(schema['properties']);
    const required = new Set(Array.isArray(schema['required']) ? schema['required'].map(String) : []);
    const generated = new Set(descriptor?.serverGeneratedFields ?? []);

    return Object.entries(properties)
      .filter(([key]) => !generated.has(key))
      .filter(([key]) => key !== 'behavioralProbe')
      .map(([key, raw]) => {
        const field = this.record(raw);
        const maxLength = Number(field['maxLength']);
        return {
          key,
          label: String(field['x-ui-label'] ?? this.humanize(key)),
          description: this.optionalString(field['x-ui-description']),
          placeholder: this.optionalString(field['x-ui-placeholder']),
          widget: this.optionalString(field['x-ui-widget']),
          maxLength: Number.isFinite(maxLength) && maxLength >= 0 ? maxLength : undefined,
          required: required.has(key),
          options: descriptor?.options[key]?.length
            ? descriptor.options[key]
            : (Array.isArray(field['enum'])
              ? field['enum'].map((value) => ({ value: String(value), label: String(value) }))
              : [])
        };
      })
      .sort((left, right) => {
        const leftOrder = Number(this.record(properties[left.key])['x-ui-order']);
        const rightOrder = Number(this.record(properties[right.key])['x-ui-order']);
        return (Number.isFinite(leftOrder) ? leftOrder : 999) - (Number.isFinite(rightOrder) ? rightOrder : 999);
      });
  }

  get canAdd(): boolean {
    if (this.readonly || !this.descriptor) return false;
    if (!this.descriptor.multiple && this.annotations.length >= 1) return false;
    const max = this.descriptor.maxItems;
    return max == null || this.annotations.length < max;
  }

  add(event?: Event) {
    event?.stopPropagation();
    if (!this.canAdd) return;
    this.editingIndex = null;
    this.draft = this.clone(this.descriptor?.defaults ?? {});
    for (const generated of this.descriptor?.serverGeneratedFields ?? []) delete this.draft[generated];
    this.clientErrors = {};
    this.editorOpen = true;
  }

  edit(index: number, event?: Event) {
    event?.stopPropagation();
    if (this.readonly || index < 0 || index >= this.annotations.length) return;
    this.editingIndex = index;
    this.draft = this.clone(this.annotations[index]);
    this.clientErrors = {};
    this.editorOpen = true;
  }

  remove(index: number, event?: Event) {
    event?.stopPropagation();
    if (this.readonly || index < 0 || index >= this.annotations.length) return;
    const next = [...this.annotations];
    next.splice(index, 1);
    this.annotationsChange.emit(next);
  }

  close(event?: Event) {
    event?.stopPropagation();
    this.editorOpen = false;
    this.clientErrors = {};
  }

  save(event?: Event) {
    event?.stopPropagation();
    this.clientErrors = this.validateDraft();
    if (Object.keys(this.clientErrors).length) return;

    const next = [...this.annotations];
    const clean = this.clone(this.draft);
    for (const field of this.fields) {
      if (clean[field.key] === '') delete clean[field.key];
    }
    if (this.editingIndex == null) next.push(clean);
    else next[this.editingIndex] = clean;
    this.annotationsChange.emit(next);
    this.close();
  }

  optionLabel(field: string, value: unknown): string {
    return this.descriptor?.options[field]?.find((option) => option.value === value)?.label ?? String(value ?? '—');
  }

  optionDescription(field: BiasField): string | null {
    const value = this.draft[field.key];
    return field.options.find((option) => option.value === value)?.description ?? field.description ?? null;
  }

  probeExecutable(annotation: BiasAnnotation): boolean {
    return isProbeExecutable(annotation.behavioralProbe);
  }

  updateProbe(probe: BehavioralProbe | undefined) {
    this.draft = { ...this.draft, behavioralProbe: probe };
  }

  valueLength(field: string): number {
    return String(this.draft[field] ?? '').length;
  }

  serverError(index: number, field?: string): string | null {
    const errors = this.relevantServerErrors();
    const expected = field ? new RegExp(`^biasAnnotations\\[${index}\\]\\.${this.escapeRegExp(field)}$`) : null;
    const found = errors.find((error) => {
      const path = String(error.field ?? '');
      return expected ? expected.test(path) : path === `biasAnnotations[${index}]`;
    });
    return found?.message ?? null;
  }

  listError(): string | null {
    const error = this.relevantServerErrors().find((candidate) =>
      candidate.code === 'TOO_MANY_BIAS_ANNOTATIONS' || candidate.field === 'biasAnnotations'
    );
    return error?.message ?? null;
  }

  private relevantServerErrors(): FlowValidationError[] {
    return this.editorState.flowValidationErrors().filter((error) => {
      if (error.code && !BIAS_ERROR_CODES.has(error.code)) return false;
      const related = error.relatedNodeIds ?? [];
      return (!error.id || error.id === this.blockId || related.includes(this.blockId))
        && String(error.field ?? '').startsWith('biasAnnotations');
    });
  }

  private validateDraft(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const field of this.fields) {
      const value = this.draft[field.key];
      if (field.required && (value == null || String(value).trim() === '')) {
        errors[field.key] = `${field.label} is required.`;
      } else if (field.maxLength != null && typeof value === 'string' && value.length > field.maxLength) {
        errors[field.key] = `${field.label} must not exceed ${field.maxLength} characters.`;
      }
    }
    return errors;
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length ? value : undefined;
  }

  private humanize(value: string): string {
    return value.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()).trim();
  }

  private clone<T>(value: T): T {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
