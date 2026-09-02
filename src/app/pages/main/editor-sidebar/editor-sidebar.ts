import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, effect, inject, signal } from '@angular/core';
import { GroupHolder } from '@shared/group-holder/group-holder';
import { FlowsList } from '@shared/flows-list/flows-list';
import { BlocksList } from '@shared/blocks-list/blocks-list';
import { ContainersList } from '@shared/containers-list/containers-list';
import { EditorStateHolder } from '@stores/flow-editor';
import { CommonModule } from '@angular/common';
import { FlowsService } from '@services/flows/flows';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { ListState } from '@stores/list-state';
import { finalize } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';

type OpenedId = 'flows' | 'blocks' | 'containers';

@Component({
  selector: 'app-editor-sidebar',
  imports: [GroupHolder, FlowsList, BlocksList, ContainersList, CommonModule, MatMenuModule, MatIconModule],
  templateUrl: './editor-sidebar.html',
  styleUrl: './editor-sidebar.css',
  providers:[ListState],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditorSidebar {
  @Output() createWithAiRequested = new EventEmitter<void>();

  flowState = inject(EditorStateHolder);

  flowService = inject(FlowsService);
  blocksService = inject(BlocksService);
  containersService = inject(ContainersService);
  confirm = inject(ConfirmDialogService);

  blockDisabled = computed(() => !this.flowState.hasFlow());
  containerDisabled = computed(() =>
    !this.flowState.hasFlow() || this.flowState.isEditingSubflow()
  );
  flowsDisabled = computed(() => this.flowState.isFullscreen());

  collapsed = signal(true);
  creatingFlow = signal(false);

  open: OpenedId | null = null;

  constructor() {
    effect(() => {
      if (!this.flowState.isEditingSubflow() || this.open !== 'containers') return;
      this.open = 'blocks';
    });
    effect(() => {
      if (!this.flowsDisabled() || this.open !== 'flows') return;
      this.open = 'blocks';
    });
    effect(() => {
      if (!this.flowState.isFullscreen()) return;
      this.collapse();
    });
  }

  ngOnInit() {
    void this.blocksService.getAllBlocksTypes().catch((err) => {
      console.error('Error preloading block types', err);
    });
    void this.containersService.getAllContainerTypes().catch((err) => {
      console.error('Error preloading container types', err);
    });
  }

  openSide(id: OpenedId) {
    if (id === 'containers' && this.containerDisabled()) return;
    if (id === 'flows' && this.flowsDisabled()) return;
    this.open = id;
    this.collapsed.set(false);
  }

  collapse() {
    this.collapsed.set(true);
    this.open = null;
  }

  async createNewFlow() {
    if (this.creatingFlow()) return;

    if (this.flowState.hasFlow() && this.flowState.isDirty()) {
      const confirmed = await this.confirm.open(
        'You have unsaved changes. Close this flow and create a new one?'
      );
      if (!confirmed) return;
      this.flowState.closeDocument();
    }

    this.creatingFlow.set(true);
    this.flowService.createNewFlow().pipe(
      finalize(() => this.creatingFlow.set(false))
    ).subscribe({
        next: flow => {
          this.flowState.openDocument(flow);
        },
        error: err => {
          console.error('Error creating new flow:', err);
        },
      });
  }

  createNewFlowWithAi() {
    this.createWithAiRequested.emit();
  }

}
