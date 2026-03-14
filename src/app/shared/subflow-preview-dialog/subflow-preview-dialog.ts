import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ReteEditor } from '@shared/rete-editor/rete-editor';
import { SubflowPreviewDialogService } from '@services/dialogs/subflow-preview-dialog';

@Component({
  selector: 'app-subflow-preview-dialog-host',
  imports: [CommonModule, MatButtonModule, ReteEditor],
  templateUrl: './subflow-preview-dialog.html',
  styleUrl: './subflow-preview-dialog.css'
})
export class SubflowPreviewDialogHostComponent {
  private dialog = inject(SubflowPreviewDialogService);

  readonly state = this.dialog.state;
  readonly flowId = computed(() => {
    const state = this.state();
    return state ? `subflow-preview:${state.title}` : 'subflow-preview';
  });

  close(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.dialog.close();
  }
}
