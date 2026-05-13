import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
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

  blockDisabled = computed(() => !this.flowState.hasFlow());

  collapsed = signal(true);
  creatingFlow = signal(false);

  open: OpenedId | null = null;

  ngOnInit() {
    void this.blocksService.getAllBlocksTypes().catch((err) => {
      console.error('Error preloading block types', err);
    });
    void this.containersService.getAllContainerTypes().catch((err) => {
      console.error('Error preloading container types', err);
    });
  }

  openSide(id: OpenedId) {
    this.open = id;
    this.collapsed.set(false);
  }

  collapse() {
    this.collapsed.set(true);
    this.open = null;
  }

  createNewFlow() {
    if (this.creatingFlow()) return;
    this.creatingFlow.set(true);
    console.log('Creating new flow...');
    this.flowService.createNewFlow().pipe(
      finalize(() => this.creatingFlow.set(false))
    ).subscribe({
        next: flow => {
          console.log('New flow created:', flow);
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

  createNewBlock() {
    console.log('Creating new block...');
  }
 
}
