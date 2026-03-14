import { Component, ElementRef, Injector, input, OnChanges, OnDestroy, output, signal, SimpleChanges, ViewChild } from '@angular/core';
import { BlockType, FlowData, FlowNode } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { BLOCK_TYPE_DRAG_MIME } from '@shared/blocks-list/block-drag';
import { CONTAINER_SUBFLOW_DRAG_MIME } from '@shared/nodes/container-node/container-node-drag';
import { EditorStateHolder } from '@stores/flow-editor';
import { addBlockToEditor, createEditor, exportGraph, ReteEditorInstance } from '@utilities/rete-editor';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-rete-editor',
  imports: [],
  templateUrl: './rete-editor.html',
  styleUrl: './rete-editor.css',
})
export class ReteEditor implements OnChanges, OnDestroy {
  readonly flowData = input.required<FlowData>();
  readonly flowId = input.required<string>();
  readonly readonly = input<boolean>(false);
  readonly nodeView = input<'editor' | 'execution'>('editor');

  constructor(
    private injector: Injector,
    private flowState: EditorStateHolder,
    private blocksService: BlocksService
  ) {}

  @ViewChild("editor") container!: ElementRef;
  @ViewChild("shell") shell!: ElementRef<HTMLElement>;

  private rete?: ReteEditorInstance;
  private viewReady = false;
  private loadVersion = 0;
  private suppressDirtyEvents = false;
  creatingEmptyBlock = false;
  creatingEmptyBlockType = '';
  selectionBox = signal<{ left: number; top: number; width: number; height: number } | null>(null);
  private selectionPointerId: number | null = null;
  private selectionStart: { x: number; y: number } | null = null;
  private readonly dirtyEventTypes = new Set([
    'nodecreated',
    'noderemoved',
    'connectioncreated',
    'connectionremoved'
  ]);

  flowChanged = output<any>();


  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.reloadEditor();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) return;
    if (changes['flowId'] || (this.readonly() && changes['flowData'])) {
      void this.reloadEditor();
    }
  }

  ngOnDestroy(): void {
    this.rete?.area.destroy();
    this.rete = undefined;
    this.flowState.stopDraggingSelectedBlocks();
  }

  get selectedBlockCount() {
    return this.flowState.selectedBlockIds().length;
  }

  get hasSelectedBlocks() {
    return !this.readonly() && this.selectedBlockCount > 0;
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      const dragTypes = Array.from(event.dataTransfer.types ?? []);
      event.dataTransfer.dropEffect = dragTypes.includes(CONTAINER_SUBFLOW_DRAG_MIME)
        ? 'move'
        : 'copy';
    }
  }

  async onDrop(event: DragEvent) {
    if (this.readonly()) return;
    event.preventDefault();
    const payload = event.dataTransfer?.getData(BLOCK_TYPE_DRAG_MIME);
    if (!payload || !this.rete) return;

    const blockType: BlockType = JSON.parse(payload);
    const position = this.getDropPosition(event);
    let newBlock: FlowNode;
    this.creatingEmptyBlock = true;
    this.creatingEmptyBlockType = blockType.type;
    try {
      newBlock = await firstValueFrom(this.blocksService.createEmptyBlock(blockType.type, blockType.family));
    } catch (error) {
      console.error('Failed to create empty block', error);
      return;
    } finally {
      this.creatingEmptyBlock = false;
      this.creatingEmptyBlockType = '';
    }

    newBlock = {
      ...newBlock,
      position
    };

    await addBlockToEditor(this.rete.editor, this.rete.area, newBlock, position);
    const updatedData = exportGraph(this.rete.editor);
    this.flowState.updateData(updatedData);
    this.flowChanged.emit(updatedData);
  }

  onShellPointerDown(event: PointerEvent) {
    if (this.readonly()) return;
    if (event.button !== 0) return;
    if (!this.canStartSelection(event.target)) return;

    this.selectionPointerId = event.pointerId;
    this.selectionStart = { x: event.clientX, y: event.clientY };
    this.selectionBox.set({ left: 0, top: 0, width: 0, height: 0 });
    this.shell.nativeElement.setPointerCapture(event.pointerId);
  }

  onShellPointerMove(event: PointerEvent) {
    if (this.selectionPointerId !== event.pointerId || !this.selectionStart) return;

    const shellRect = this.shell.nativeElement.getBoundingClientRect();
    const left = Math.min(this.selectionStart.x, event.clientX) - shellRect.left;
    const top = Math.min(this.selectionStart.y, event.clientY) - shellRect.top;
    const width = Math.abs(event.clientX - this.selectionStart.x);
    const height = Math.abs(event.clientY - this.selectionStart.y);

    this.selectionBox.set({ left, top, width, height });
  }

  onShellPointerUp(event: PointerEvent) {
    if (this.selectionPointerId !== event.pointerId || !this.selectionStart) return;

    const shell = this.shell.nativeElement;
    if (shell.hasPointerCapture(event.pointerId)) {
      shell.releasePointerCapture(event.pointerId);
    }

    const start = this.selectionStart;
    const moved = Math.abs(event.clientX - start.x) > 4 || Math.abs(event.clientY - start.y) > 4;
    if (moved) {
      this.flowState.setSelectedBlocks(this.resolveBlocksInsideSelection());
    } else if (this.canStartSelection(event.target)) {
      this.flowState.clearBlockSelection();
    }

    this.selectionPointerId = null;
    this.selectionStart = null;
    this.selectionBox.set(null);
  }

  onSelectionDragStart(event: DragEvent) {
    if (!event.dataTransfer) return;

    const selectedBlockIds = this.flowState.selectedBlockIds();
    if (!selectedBlockIds.length) {
      event.preventDefault();
      return;
    }

    this.flowState.startDraggingSelectedBlocks(selectedBlockIds);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(CONTAINER_SUBFLOW_DRAG_MIME, JSON.stringify(selectedBlockIds));
  }

  onSelectionDragEnd() {
    this.flowState.stopDraggingSelectedBlocks();
  }

  private async reloadEditor() {
    const host = this.container?.nativeElement as HTMLElement | undefined;
    if (!host) return;

    const currentVersion = ++this.loadVersion;
    this.flowState.clearBlockSelection();
    this.suppressDirtyEvents = true;
    this.rete?.area.destroy();
    this.rete = undefined;
    host.innerHTML = '';

    const rete = await createEditor(host, this.injector, this.flowData(), {
      nodeView: this.nodeView()
    });
    if (currentVersion !== this.loadVersion) {
      rete.area.destroy();
      return;
    }

    this.rete = rete;
    const loadedFlowId = this.flowId();
    const normalizedData = exportGraph(rete.editor);
    if (this.flowState.currentFlow()?.id === loadedFlowId) {
      this.flowState.replaceDataWithoutDirty(normalizedData);
    }
    if (!this.readonly()) {
      rete.editor.addPipe((context) => {
        if (this.dirtyEventTypes.has(context.type)) {
          this.markFlowChanged(rete, context, loadedFlowId, currentVersion);
        }
        return context;
      });

      rete.area.addPipe((context: any) => {
        if (context?.type === 'nodetranslated') {
          this.markFlowChanged(rete, context, loadedFlowId, currentVersion);
        }
        return context;
      });
    }

    queueMicrotask(() => {
      if (currentVersion === this.loadVersion && this.rete === rete) {
        this.suppressDirtyEvents = false;
      }
    });
  }

  private getDropPosition(event: DragEvent) {
    const host = this.container.nativeElement as HTMLElement;
    const rect = host.getBoundingClientRect();
    const transform = this.rete!.area.area.transform;

    const x = (event.clientX - rect.left - transform.x) / transform.k;
    const y = (event.clientY - rect.top - transform.y) / transform.k;
    return { x, y };
  }

  private syncNodePositionFromContext(rete: ReteEditorInstance, context: any) {
    if (context?.type !== 'nodetranslated') return;

    const movedNode = rete.editor.getNode(context?.data?.id) as any;
    const pos = context?.data?.position;
    if (!movedNode?.data || !pos) return;

    movedNode.data = {
      ...movedNode.data,
      position: { x: pos.x, y: pos.y }
    };

    // Keep socket anchors and connection paths visually in sync while dragging.
    void rete.area.update('node', movedNode.id);
  }

  private markFlowChanged(rete: ReteEditorInstance, context: any, loadedFlowId: string, loadedVersion: number) {
    if (this.readonly()) return;
    if (this.suppressDirtyEvents) return;
    if (loadedVersion !== this.loadVersion) return;
    if (this.rete !== rete) return;
    if (this.flowId() !== loadedFlowId) return;
    this.syncNodePositionFromContext(rete, context);
    if (this.flowState.currentFlow()?.id !== loadedFlowId) return;

    const updatedData = exportGraph(rete.editor);
    this.flowState.updateData(updatedData);
    this.flowChanged.emit(updatedData);
  }

  private canStartSelection(target: EventTarget | null) {
    const element = target instanceof HTMLElement ? target : null;
    if (!element) return false;
    if (element.closest('[data-testid="node"]')) return false;
    if (element.closest('button, input, textarea, select, option, label, a')) return false;
    return true;
  }

  private resolveBlocksInsideSelection() {
    const selection = this.selectionBox();
    if (!selection) return [];

    const shellRect = this.shell.nativeElement.getBoundingClientRect();
    const selectionRect = {
      left: shellRect.left + selection.left,
      top: shellRect.top + selection.top,
      right: shellRect.left + selection.left + selection.width,
      bottom: shellRect.top + selection.top + selection.height
    };

    return Array.from(
      this.shell.nativeElement.querySelectorAll<HTMLElement>('[data-testid="node"][data-block-id]')
    )
      .filter((element) => this.isRectIntersecting(selectionRect, element.getBoundingClientRect()))
      .map((element) => element.dataset['blockId'] ?? '')
      .filter((blockId) => blockId.length > 0);
  }

  private isRectIntersecting(
    selectionRect: { left: number; top: number; right: number; bottom: number },
    targetRect: DOMRect
  ) {
    return !(
      targetRect.right < selectionRect.left
      || targetRect.left > selectionRect.right
      || targetRect.bottom < selectionRect.top
      || targetRect.top > selectionRect.bottom
    );
  }
}
