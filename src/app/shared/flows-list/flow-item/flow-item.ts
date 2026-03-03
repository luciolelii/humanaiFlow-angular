import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, model } from '@angular/core';
import { Flow } from '@models/flow';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { FlowsService } from '@services/flows/flows';
import { EditorStateHolder } from '@stores/flow-editor';

@Component({
  selector: 'app-flow-item',
  imports: [CommonModule],
  templateUrl: './flow-item.html',
  styleUrl: './flow-item.css',
})
export class FlowItem {

  private editorState = inject(EditorStateHolder);
  private confirm = inject(ConfirmDialogService);

  private flowsService = inject(FlowsService);

  flow = input.required<Flow>();

  detailOpenedId = model<string | null>(null);

  openedFlowId = computed(() => this.editorState.currentFlow()?.id);

  async open() {
    console.log('Opening flow:', this.flow());
    if (this.editorState.isDirty() && this.openedFlowId() !== this.flow().id) {
      const confirmed = await this.confirm.open(
        'You have unsaved changes in the current flow. Open another flow anyway?'
      );
      if (!confirmed) return;
      await this.editorState.openDocument(this.flow(), { skipDirtyCheck: true });
      return;
    }
    await this.editorState.openDocument(this.flow());
  }

  clone() {
    this.flowsService.cloneFlow(this.flow().id).subscribe({
      next: clonedFlow => {
        console.log('Flow cloned:', clonedFlow);
      },
      error: err => console.error('Error cloning flow:', err)
    });
  }

  async remove() {
    const confirmed = await this.confirm.open(
      this.editorState.isDirty()
        ? 'You have unsaved changes in the current flow. Delete this flow anyway?'
        : 'Are you sure you want to delete this flow?'
    );
    if (!confirmed) return;

    this.flowsService.deleteFlow(this.flow().id).subscribe({
      next: () => {
        console.log('Flow deleted:', this.flow().id);
        if (this.openedFlowId() === this.flow().id) {
          this.editorState.closeDocument();
        }
      },
      error: err => console.error('Error deleting flow:', err)
    });
  }

}
