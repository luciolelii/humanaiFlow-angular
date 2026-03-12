import { Component, effect, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  HumanInteractionDialogResult,
  HumanInteractionDialogService
} from '@services/dialogs/human-interaction-dialog';

@Component({
  selector: 'app-human-interaction-dialog-host',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './human-interaction-dialog.html'
})
export class HumanInteractionDialogHostComponent {
  private dialog = inject(HumanInteractionDialogService);
  private host = inject(ElementRef<HTMLElement>);

  readonly state = this.dialog.state;
  readonly editing = signal(false);
  draftValue = '';

  constructor() {
    effect(() => {
      const state = this.state();
      if (!state) return;
      this.editing.set(false);
      this.draftValue = state.currentInput;
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

  startEditing(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.editing.set(true);
    queueMicrotask(() => {
      const target = this.host.nativeElement.querySelector('[data-autofocus="true"]') as HTMLElement | null;
      target?.focus();
    });
  }

  backToConfirm(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.editing.set(false);
  }

  setDraftValue(value: string) {
    this.draftValue = value;
  }

  confirmInput(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.closeWith({ mode: 'confirm', value: this.state()?.currentInput ?? '' });
  }

  sendEditedOutput(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const value = this.draftValue.trim();
    if (!value) return;
    this.closeWith({ mode: 'edit', value: this.draftValue });
  }

  canSendEditedOutput(): boolean {
    return this.draftValue.trim().length > 0;
  }

  private closeWith(value: HumanInteractionDialogResult) {
    this.dialog.close(value);
  }
}
