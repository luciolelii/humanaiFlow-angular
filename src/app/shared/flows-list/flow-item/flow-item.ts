import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Flow } from '@models/flow';
import { Project } from '@models/project';
import { Authorization } from '@services/authorization/authorization';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { FlowsService } from '@services/flows/flows';
import { NotificationService } from '@services/notifications/notification';
import { ProjectsService } from '@services/projects/projects';
import { PROJECTS_ENABLED } from '@shared/feature-flags';
import { EditorStateHolder } from '@stores/flow-editor';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-flow-item',
  imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './flow-item.html',
  styleUrl: './flow-item.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowItem {

  private editorState = inject(EditorStateHolder);
  private confirm = inject(ConfirmDialogService);
  private authorization = inject(Authorization);

  private flowsService = inject(FlowsService);
  private projectsService = inject(ProjectsService);
  private notifications = inject(NotificationService);

  readonly projectsEnabled = PROJECTS_ENABLED;
  readonly assignableProjects = this.projectsService.projects;

  flow = input.required<Flow>();

  detailOpenedId = model<string | null>(null);

  openedFlowId = computed(() => this.editorState.currentFlow()?.id);
  isRootOpen = computed(() =>
    this.openedFlowId() === this.flow().id && !this.editorState.isEditingSubflow()
  );
  canDelete = computed(() => {
    const username = this.authorization.loggedInUser()?.username ?? null;
    return !!username && this.flow().author === username && !this.flow().finalized;
  });
  /**
   * Ownership only - deliberately not gated on `finalized`. Assignment goes through the dedicated
   * project endpoint, not the flow update path, so a finalized flow stays reorganizable.
   */
  canAssignProject = computed(() => {
    const username = this.authorization.loggedInUser()?.username ?? null;
    return !!username && this.flow().author === username;
  });
  assignTooltip = computed(() =>
    this.canAssignProject() ? 'Move to project' : 'Only the owner can move this flow'
  );

  async assignToProject(project: Project | null) {
    if (!this.canAssignProject()) return;
    const targetId = project?.id ?? null;
    if ((this.flow().projectId ?? null) === targetId) return;

    try {
      await firstValueFrom(this.flowsService.assignFlowToProject(this.flow().id, targetId));
      this.notifications.show(
        project ? `Moved to “${project.name}”` : 'Removed from project',
        'success'
      );
    } catch {
      this.notifications.show('Could not move the flow.', 'error');
    }
  }

  deleteTooltip = computed(() =>
    this.flow().finalized
      ? 'Finalized flows cannot be deleted'
      : this.canDelete()
        ? 'Delete flow'
        : 'Only the owner can delete this flow'
  );

  async open() {
    if (this.openedFlowId() === this.flow().id) {
      this.editorState.openRootFlow();
      return;
    }
    if (this.editorState.isDirty() && this.openedFlowId() !== this.flow().id) {
      const confirmed = await this.confirm.open(
        'You have unsaved changes in the current flow. Open another flow anyway?'
      );
      if (!confirmed) return;
      await this.editorState.openDocument(await this.loadCompleteFlow(), { skipDirtyCheck: true });
      return;
    }
    await this.editorState.openDocument(await this.loadCompleteFlow());
  }

  private async loadCompleteFlow(): Promise<Flow> {
    try {
      return await firstValueFrom(this.flowsService.getFlowById(this.flow().id, true));
    } catch (error) {
      console.error('Error loading complete flow', error);
      return this.flow();
    }
  }

  clone() {
    this.flowsService.cloneFlow(this.flow()).subscribe({
      error: err => console.error('Error cloning flow:', err)
    });
  }

  async remove() {
    if (!this.canDelete()) return;

    const confirmed = await this.confirm.open(
      this.editorState.isDirty()
        ? 'You have unsaved changes in the current flow. Delete this flow anyway?'
        : 'Are you sure you want to delete this flow?'
    );
    if (!confirmed) return;

    this.flowsService.deleteFlow(this.flow().id).subscribe({
      next: () => {
        if (this.openedFlowId() === this.flow().id) {
          this.editorState.closeDocument();
        }
      },
      error: err => console.error('Error deleting flow:', err)
    });
  }

}
