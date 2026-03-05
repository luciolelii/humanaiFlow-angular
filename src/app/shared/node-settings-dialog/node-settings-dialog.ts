import { Component, effect, ElementRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NodeSettingField,
  NodeSettingsDialogService,
  NodeSettingsValues
} from '@services/dialogs/node-settings-dialog';

@Component({
  selector: 'app-node-settings-dialog-host',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './node-settings-dialog.html'
})
export class NodeSettingsDialogHostComponent {
  private dialog = inject(NodeSettingsDialogService);
  private host = inject(ElementRef<HTMLElement>);
  state = this.dialog.state;

  draft: NodeSettingsValues = {};
  fields: NodeSettingField[] = [];

  constructor() {
    effect(() => {
      const state = this.state();
      if (!state) return;
      this.fields = state.fields;
      this.draft = this.buildDraft(state.fields, state.initial);
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

  setFieldValue(key: string, value: string | boolean) {
    this.draft[key] = value;
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
}
