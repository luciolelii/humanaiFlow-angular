import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ReteEditor } from '@shared/rete-editor/rete-editor';
import { SubflowPreviewDialogService } from '@services/dialogs/subflow-preview-dialog';
import { FlowsService } from '@services/flows/flows';
import { EditorStateHolder } from '@stores/flow-editor';
import { firstValueFrom } from 'rxjs';
import { FlowData } from '@models/flow';
import { NotificationService } from '@services/notifications/notification';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';

@Component({
  selector: 'app-subflow-preview-dialog-host',
  imports: [CommonModule, MatButtonModule, MatIconModule, ReteEditor],
  templateUrl: './subflow-preview-dialog.html',
  styleUrl: './subflow-preview-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubflowPreviewDialogHostComponent {
  private dialog = inject(SubflowPreviewDialogService);
  private flowsService = inject(FlowsService);
  private editorState = inject(EditorStateHolder);
  private notification = inject(NotificationService);
  private confirm = inject(ConfirmDialogService);

  readonly state = this.dialog.state;
  readonly exporting = signal(false);
  readonly flowId = computed(() => {
    const state = this.state();
    return state ? `subflow-preview:${state.title}` : 'subflow-preview';
  });

  close(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.dialog.close();
  }

  async exportSubflow(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.exporting()) return;

    const state = this.state();
    if (!state) return;

    this.exporting.set(true);
    try {
      const name = this.nextFlowName(`sub_${state.sourceName}`);
      const createdFlow = await firstValueFrom(this.flowsService.createFlow({
        name,
        description: `Extracted from ${state.sourceName}`,
        data: this.cloneFlowData(state.flowData),
        status: 'DRAFT'
      }));

      this.notification.show(`Subflow added to flows list as ${name}.`, 'success');

      const hasUnsavedChanges = this.editorState.hasFlow() && this.editorState.isDirty();
      const openNow = await this.confirm.open(this.buildExportMessage(name, hasUnsavedChanges));
      if (openNow) {
        await this.editorState.openDocument(createdFlow, { skipDirtyCheck: true });
        this.dialog.close();
      }
    } catch (error) {
      console.error('Export subflow failed', error);
      this.notification.show('Unable to export subflow. Please retry.', 'error');
    } finally {
      this.exporting.set(false);
    }
  }

  private nextFlowName(baseName: string): string {
    const sanitizedBase = baseName.trim() || 'sub_container';
    const existing = new Set(this.flowsService.flows().map((flow) => flow.name));
    if (!existing.has(sanitizedBase)) return sanitizedBase;

    let index = 1;
    while (existing.has(`${sanitizedBase}(${index})`)) {
      index++;
    }
    return `${sanitizedBase}(${index})`;
  }

  private cloneFlowData(flowData: FlowData): FlowData {
    if (typeof structuredClone === 'function') {
      return structuredClone(flowData);
    }

    return JSON.parse(JSON.stringify(flowData)) as FlowData;
  }

  private buildExportMessage(flowName: string, hasUnsavedChanges: boolean): string {
    const unsavedWarning = hasUnsavedChanges
      ? ' The current flow has unsaved changes: opening now will discard your pending edits.'
      : '';

    return `Subflow added to the flows list as ${flowName}. Do you want to open it now?${unsavedWarning} Note: the container subflow is not updated automatically; once you finish and save this new flow, re-import it into the container.`;
  }
}
