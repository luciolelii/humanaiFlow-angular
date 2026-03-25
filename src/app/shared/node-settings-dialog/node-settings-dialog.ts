import { Component, effect, ElementRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  NodeSettingField,
  NodeSettingsDialogService,
  NodeSettingsValues
} from '@services/dialogs/node-settings-dialog';

@Component({
  selector: 'app-node-settings-dialog-host',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatTooltipModule],
  templateUrl: './node-settings-dialog.html'
})
export class NodeSettingsDialogHostComponent {
  private dialog = inject(NodeSettingsDialogService);
  private host = inject(ElementRef<HTMLElement>);
  private refreshVersion = 0;
  state = this.dialog.state;

  draft: NodeSettingsValues = {};
  fields: NodeSettingField[] = [];
  passwordVisibility: Record<string, boolean> = {};

  constructor() {
    effect(() => {
      const state = this.state();
      if (!state) return;
      this.refreshVersion += 1;
      this.fields = state.fields;
      this.draft = this.buildDraft(state.fields, state.initial);
      this.passwordVisibility = {};
      queueMicrotask(() => {
        const target = this.host.nativeElement.querySelector('[data-autofocus="true"]') as HTMLElement | null;
        target?.focus();
      });
    });
  }

  cancel(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.dialog.close(null);
  }

  save(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.dialog.close({ ...this.draft });
  }

  isPreviewOnly(): boolean {
    return this.state()?.previewOnly === true;
  }

  setFieldValue(key: string, value: string | boolean) {
    this.draft[key] = value;
    void this.refreshFieldsFromDraft();
  }

  async copyFieldValue(key: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const value = this.draft[key];
    const text = typeof value === 'string' ? value : String(value ?? '');

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore clipboard errors in unsupported/denied contexts.
    }
  }

  isPasswordVisible(key: string): boolean {
    return this.passwordVisibility[key] === true;
  }

  togglePasswordVisibility(key: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.passwordVisibility = {
      ...this.passwordVisibility,
      [key]: !this.isPasswordVisible(key)
    };
  }

  private buildDraft(fields: NodeSettingField[], initial: NodeSettingsValues): NodeSettingsValues {
    const values: NodeSettingsValues = {};
    for (const field of fields) {
      const initialValue = initial[field.key];
      if (initialValue !== undefined) {
        values[field.key] = initialValue;
        continue;
      }
      if (field.type === 'checkbox') {
        values[field.key] = false;
      } else {
        values[field.key] = '';
      }
    }
    return values;
  }

  private async refreshFieldsFromDraft() {
    const state = this.state();
    if (!state?.onValuesChange) return;

    const requestVersion = ++this.refreshVersion;
    const currentDraft = { ...this.draft };
    const next = await state.onValuesChange(currentDraft);
    if (!next || requestVersion !== this.refreshVersion) return;

    this.fields = next.fields;
    const rebuiltDraft = this.buildDraft(next.fields, next.initial ?? {});
    for (const field of next.fields) {
      if (!Object.prototype.hasOwnProperty.call(currentDraft, field.key)) continue;
      const currentValue = currentDraft[field.key];
      if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
        const currentStringValue = typeof currentValue === 'string' ? currentValue : String(currentValue ?? '');
        const optionStillAvailable = field.options.some((option) => option.value === currentStringValue);
        if (!optionStillAvailable) continue;
      }
      rebuiltDraft[field.key] = currentValue;
    }
    this.draft = rebuiltDraft;
  }
}
