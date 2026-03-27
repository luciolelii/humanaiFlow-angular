import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FlowValidationError } from '@models/flow';
import { EditorStateHolder } from '@stores/flow-editor';

@Component({
  selector: 'app-flow-validation-panel',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './flow-validation-panel.html',
  styleUrl: './flow-validation-panel.css'
})
export class FlowValidationPanel {
  private readonly editorState = inject(EditorStateHolder);

  readonly errors = this.editorState.flowValidationErrors;
  readonly validationRequiresSave = this.editorState.validationRequiresSave;
  readonly errorCount = computed(() => this.errors().length);
  readonly hasErrors = computed(() => this.errorCount() > 0);

  trackByError(_index: number, error: FlowValidationError) {
    return `${error.code ?? 'VALIDATION_ERROR'}:${error.entity ?? ''}:${error.id ?? ''}:${error.field ?? ''}:${error.message}`;
  }

  focusError(error: FlowValidationError) {
    const nodeIds = Array.isArray(error.relatedNodeIds) ? error.relatedNodeIds : [];
    this.editorState.setHighlightedValidationNodes(nodeIds);
  }

  highlightAll() {
    const nodeIds = this.errors().flatMap((error) => Array.isArray(error.relatedNodeIds) ? error.relatedNodeIds : []);
    this.editorState.setHighlightedValidationNodes(nodeIds);
  }

  clearHighlight() {
    this.editorState.setHighlightedValidationNodes([]);
  }
}
