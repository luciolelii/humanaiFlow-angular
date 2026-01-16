import { CommonModule } from '@angular/common';
import { Component, computed, effect, EventEmitter, inject, input, model, output, signal, untracked } from '@angular/core';
import { Flow } from '@models/flow';
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

  private flowsService = inject(FlowsService);

  flow = input.required<Flow>();

  detailOpenedId = model<string | null>(null);

  openedFlowId = computed(() => this.editorState.currentFlow()?.id);

  expanded = signal(false);

  constructor() {
    effect(() => {
      if (this.expanded()) {
        if (this.detailOpenedId() !== this.flow().id) {
          this.expanded.set(false);
        }
      }
    });
  }

  open() {
    console.log('Opening flow:', this.flow());
    this.editorState.openDocument(this.flow());
  }

  clone() {
    this.flowsService.cloneFlow(this.flow().id).subscribe({
      next: clonedFlow => {
        console.log('Flow cloned:', clonedFlow);
      },
      error: err => console.error('Error cloning flow:', err)
    });
  }

  remove() {
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

  toggleDetails() {
    this.expanded.update(v => !v);
    if (this.expanded()) {
      this.detailOpenedId.set(this.flow().id);
    } else {
      this.detailOpenedId.set(null);
    }
  }
}

