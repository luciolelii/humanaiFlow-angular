import { ChangeDetectionStrategy, Component, effect, ElementRef, HostListener, Injector, input, OnChanges, OnDestroy, output, signal, SimpleChanges, untracked, viewChild } from '@angular/core';
import { BlockType, FlowData, FlowNode } from '@models/flow';
import { Drag } from 'rete-area-plugin';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { BLOCK_TYPE_DRAG_MIME } from '@shared/blocks-list/block-drag';
import { CONTAINER_SUBFLOW_DRAG_MIME } from '@shared/nodes/container-node/container-node-drag';
import { GraphSelectionService } from '@services/graph-selection/graph-selection';
import { EditorStateHolder } from '@stores/flow-editor';
import { addBlockToEditor, createEditor, exportGraph, ReteEditorInstance, setEditorGlobalInputs } from '@utilities/rete-editor';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-rete-editor',
  imports: [],
  templateUrl: './rete-editor.html',
  styleUrl: './rete-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReteEditor implements OnChanges, OnDestroy {
  readonly flowData = input.required<FlowData>();
  readonly flowId = input.required<string>();
  readonly readonly = input<boolean>(false);
  readonly nodeView = input<'editor' | 'execution'>('editor');

  constructor(
    private injector: Injector,
    private flowState: EditorStateHolder,
    private blocksService: BlocksService,
    private containersService: ContainersService,
    private graphSelection: GraphSelectionService
  ) {
    effect(() => {
      this.graphSelection.deleteConnectionRequestTick();
      const connectionId = untracked(() => this.graphSelection.selectedConnectionId());
      const rete = untracked(() => this.rete);
      const isReadonly = untracked(() => this.readonly());
      if (!connectionId || !rete || isReadonly) return;
      void this.deleteSelectedConnection(connectionId);
    });
  }

  readonly container = viewChild.required<ElementRef>('editor');
  readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');

  private rete?: ReteEditorInstance;
  private viewReady = false;
  private loadVersion = 0;
  private suppressDirtyEvents = false;
  private typesLoadingPromise: Promise<void> | null = null;
  creatingEmptyBlock = false;
  creatingEmptyBlockType = '';
  initialTypesLoading = signal(false);
  editorMode = signal<'standard' | 'select'>('standard');
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
    if (changes['flowId']) {
      void this.reloadEditor();
      return;
    }
    if (changes['flowData'] && this.rete) {
      setEditorGlobalInputs(this.rete.editor, this.flowData().globalInputs ?? []);
    }
    if (this.readonly() && changes['flowData']) {
      void this.syncReadonlyFlowData();
    }
  }

  ngOnDestroy(): void {
    this.rete?.area.destroy();
    this.rete = undefined;
    this.graphSelection.clearConnectionSelection();
    this.flowState.stopDraggingSelectedBlocks();
  }

  get selectedBlockCount() {
    return this.flowState.selectedBlockIds().length;
  }

  get hasSelectedBlocks() {
    return !this.readonly() && this.selectedBlockCount > 0;
  }

  get selectionModeActive() {
    return this.editorMode() === 'select';
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
      newBlock = blockType.family === 'container'
        ? await firstValueFrom(this.containersService.createEmptyContainer(blockType.type))
        : await firstValueFrom(this.blocksService.createEmptyBlock(blockType.type, {
          flowId: this.flowId()
        }));
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
    this.graphSelection.clearConnectionSelection();
    if (event.button !== 0) return;
    if (!this.canStartSelection(event.target)) return;

    this.selectionPointerId = event.pointerId;
    this.selectionStart = { x: event.clientX, y: event.clientY };
    this.selectionBox.set({ left: 0, top: 0, width: 0, height: 0 });
    this.shell().nativeElement.setPointerCapture(event.pointerId);
  }

  setEditorMode(mode: 'standard' | 'select', event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.readonly()) return;
    this.editorMode.set(mode);
    this.syncAreaDragMode();
    if (mode === 'standard') {
      this.selectionPointerId = null;
      this.selectionStart = null;
      this.selectionBox.set(null);
    }
  }

  zoomIn(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    void this.applyZoom(1.12);
  }

  zoomOut(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    void this.applyZoom(1 / 1.12);
  }

  onShellPointerMove(event: PointerEvent) {
    if (this.selectionPointerId !== event.pointerId || !this.selectionStart) return;

    const shellRect = this.shell().nativeElement.getBoundingClientRect();
    const left = Math.min(this.selectionStart.x, event.clientX) - shellRect.left;
    const top = Math.min(this.selectionStart.y, event.clientY) - shellRect.top;
    const width = Math.abs(event.clientX - this.selectionStart.x);
    const height = Math.abs(event.clientY - this.selectionStart.y);

    this.selectionBox.set({ left, top, width, height });
  }

  onShellPointerUp(event: PointerEvent) {
    if (this.selectionPointerId !== event.pointerId || !this.selectionStart) return;

    const shell = this.shell().nativeElement;
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

  onShellClick(event: MouseEvent) {
    const target = event.target as Element | null;
    if (!target) {
      this.graphSelection.clearConnectionSelection();
      return;
    }

    if (
      target.closest('[data-testid="connection"]') ||
      target.closest('.connection-delete') ||
      target.closest('[data-testid="node"]') ||
      target.closest('.rete-editor-toolbar') ||
      target.closest('.rete-editor-selection-badge')
    ) {
      return;
    }

    this.graphSelection.clearConnectionSelection();
  }

  @HostListener('window:pointerdown', ['$event'])
  onWindowPointerDown(event: PointerEvent) {
    const target = event.target as Element | null;
    if (!target) return;
    if (target.closest('[data-testid="connection"]') || target.closest('.connection-delete')) return;
    this.graphSelection.clearConnectionSelection();
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent) {
    if (this.readonly()) return;
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;

    const connectionId = this.graphSelection.selectedConnectionId();
    if (!connectionId || !this.rete) return;

    event.preventDefault();
    void this.deleteSelectedConnection(connectionId);
  }

  private async reloadEditor() {
    const host = this.container()?.nativeElement as HTMLElement | undefined;
    if (!host) return;

    await this.ensureNodeTypesLoaded();

    const currentVersion = ++this.loadVersion;
    this.editorMode.set('standard');
    this.selectionPointerId = null;
    this.selectionStart = null;
    this.selectionBox.set(null);
    this.flowState.clearBlockSelection();
    this.graphSelection.clearConnectionSelection();
    this.suppressDirtyEvents = true;
    this.rete?.area.destroy();
    this.rete = undefined;
    host.innerHTML = '';

    const rete = await createEditor(host, this.injector, this.flowData(), {
      nodeView: this.nodeView(),
      readonly: this.readonly()
    });
    if (currentVersion !== this.loadVersion) {
      rete.area.destroy();
      return;
    }

    this.rete = rete;
    setEditorGlobalInputs(rete.editor, this.flowData().globalInputs ?? []);
    this.syncAreaDragMode();
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

  private async deleteSelectedConnection(connectionId: string) {
    if (!this.rete) return;

    const currentConnection = this.rete.editor.getConnections().find((connection) => String(connection.id) === connectionId);
    if (!currentConnection) {
      this.graphSelection.clearConnectionSelection();
      return;
    }

    await this.rete.editor.removeConnection(currentConnection.id);
    const updatedData = exportGraph(this.rete.editor);
    this.flowState.updateData(updatedData, { structural: true });
    this.flowChanged.emit(updatedData);
    this.graphSelection.clearConnectionSelection();
  }

  private async syncReadonlyFlowData() {
    if (!this.readonly()) return;
    const rete = this.rete;
    if (!rete) {
      await this.reloadEditor();
      return;
    }

    const nextFlowData = this.flowData();
    setEditorGlobalInputs(rete.editor, nextFlowData.globalInputs ?? []);
    if (!this.canPatchReadonlyFlowData(rete, nextFlowData)) {
      await this.reloadEditor();
      return;
    }

    await this.patchReadonlyNodes(rete, nextFlowData);
  }

  private canPatchReadonlyFlowData(rete: ReteEditorInstance, nextFlowData: FlowData) {
    const currentNodes = rete.editor.getNodes() as any[];
    const nextNodes = [...(nextFlowData.blocks ?? []), ...(nextFlowData.containers ?? [])];
    if (currentNodes.length !== nextNodes.length) return false;

    const currentByBlockId = new Map(
      currentNodes.map((node: any) => [String(node.data?.id ?? ''), node])
    );

    for (const nextNode of nextNodes) {
      const currentNode = currentByBlockId.get(String(nextNode.id));
      if (!currentNode?.data) return false;
      if (!this.hasSameNodeStructure(currentNode.data as FlowNode, nextNode)) return false;
    }

    return this.hasSameConnectionStructure(exportGraph(rete.editor), nextFlowData);
  }

  private hasSameNodeStructure(currentNode: FlowNode, nextNode: FlowNode) {
    return currentNode.id === nextNode.id
      && currentNode.nodeFamily === nextNode.nodeFamily
      && currentNode.typeName === nextNode.typeName
      && this.hasSamePortStructure(currentNode.inputs, nextNode.inputs)
      && this.hasSamePortStructure(currentNode.outputs, nextNode.outputs);
  }

  private hasSamePortStructure(
    currentPorts: FlowNode['inputs'] | FlowNode['outputs'],
    nextPorts: FlowNode['inputs'] | FlowNode['outputs']
  ) {
    const current = currentPorts ?? [];
    const next = nextPorts ?? [];
    if (current.length !== next.length) return false;

    return current.every((port, index) => {
      const candidate = next[index];
      return port.name === candidate?.name && port.type === candidate?.type;
    });
  }

  private hasSameConnectionStructure(currentFlowData: FlowData, nextFlowData: FlowData) {
    const currentConnections = [...(currentFlowData.connections ?? [])]
      .map((connection) => `${connection.sourceId}:${connection.sourceName}->${connection.targetId}:${connection.targetName}`)
      .sort();
    const nextConnections = [...(nextFlowData.connections ?? [])]
      .map((connection) => `${connection.sourceId}:${connection.sourceName}->${connection.targetId}:${connection.targetName}`)
      .sort();

    if (currentConnections.length !== nextConnections.length) return false;
    if (!currentConnections.every((connection, index) => connection === nextConnections[index])) return false;

    const currentDependencies = [...(currentFlowData.dependencies ?? [])]
      .map((dependency) => `${dependency.sourceId}->${dependency.targetId}`)
      .sort();
    const nextDependencies = [...(nextFlowData.dependencies ?? [])]
      .map((dependency) => `${dependency.sourceId}->${dependency.targetId}`)
      .sort();

    if (currentDependencies.length !== nextDependencies.length) return false;
    if (!currentDependencies.every((dependency, index) => dependency === nextDependencies[index])) return false;

    const currentGlobalInputs = [...(currentFlowData.globalInputs ?? [])]
      .map((input) => `${input.name}:${String(input.type ?? '').toUpperCase()}:${input.multiple ? 'multi' : 'single'}`)
      .sort();
    const nextGlobalInputs = [...(nextFlowData.globalInputs ?? [])]
      .map((input) => `${input.name}:${String(input.type ?? '').toUpperCase()}:${input.multiple ? 'multi' : 'single'}`)
      .sort();

    if (currentGlobalInputs.length !== nextGlobalInputs.length) return false;
    return currentGlobalInputs.every((input, index) => input === nextGlobalInputs[index]);
  }

  private async patchReadonlyNodes(rete: ReteEditorInstance, nextFlowData: FlowData) {
    const nextNodes = [...(nextFlowData.blocks ?? []), ...(nextFlowData.containers ?? [])];
    const currentNodes = new Map(
      (rete.editor.getNodes() as any[]).map((node) => [String(node.data?.id ?? ''), node])
    );

    for (const nextNode of nextNodes) {
      const currentNode = currentNodes.get(String(nextNode.id));
      if (!currentNode?.data) continue;

      const nextReadonlyNode = {
        ...currentNode.data,
        ...nextNode,
        position: nextNode.position ?? currentNode.data.position,
        __readonly: true
      };

      if (this.hasSameReadonlyNodePayload(currentNode.data as FlowNode & Record<string, unknown>, nextReadonlyNode as FlowNode & Record<string, unknown>)) {
        continue;
      }

      currentNode.data = nextReadonlyNode;

      await rete.area.update('node', currentNode.id);
    }
  }

  private hasSameReadonlyNodePayload(currentNode: FlowNode & Record<string, unknown>, nextNode: FlowNode & Record<string, unknown>) {
    return JSON.stringify({
      id: currentNode.id,
      name: currentNode.name,
      position: currentNode.position,
      inputs: currentNode.inputs,
      outputs: currentNode.outputs,
      specificConfiguration: currentNode.specificConfiguration,
      typeName: currentNode.typeName,
      userInteractive: currentNode['userInteractive'],
      nodeFamily: currentNode.nodeFamily,
      __readonly: currentNode['__readonly']
    }) === JSON.stringify({
      id: nextNode.id,
      name: nextNode.name,
      position: nextNode.position,
      inputs: nextNode.inputs,
      outputs: nextNode.outputs,
      specificConfiguration: nextNode.specificConfiguration,
      typeName: nextNode.typeName,
      userInteractive: nextNode['userInteractive'],
      nodeFamily: nextNode.nodeFamily,
      __readonly: nextNode['__readonly']
    });
  }

  private getDropPosition(event: DragEvent) {
    const host = this.container().nativeElement as HTMLElement;
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

    setEditorGlobalInputs(rete.editor, this.flowData().globalInputs ?? []);
    const updatedData = exportGraph(rete.editor);
    this.flowState.updateData(updatedData, { structural: context?.type !== 'nodetranslated' });
    this.flowChanged.emit(updatedData);
  }

  private canStartSelection(target: EventTarget | null) {
    if (!this.selectionModeActive) return false;
    const element = target instanceof HTMLElement ? target : null;
    if (!element) return false;
    if (element.closest('[data-testid="node"]')) return false;
    if (element.closest('button, input, textarea, select, option, label, a')) return false;
    return true;
  }

  private syncAreaDragMode() {
    const area = this.rete?.area?.area;
    if (!area) return;

    area.setDragHandler(this.selectionModeActive ? null : new Drag());
  }

  private resolveBlocksInsideSelection() {
    const selection = this.selectionBox();
    if (!selection) return [];

    const shellRect = this.shell().nativeElement.getBoundingClientRect();
    const selectionRect = {
      left: shellRect.left + selection.left,
      top: shellRect.top + selection.top,
      right: shellRect.left + selection.left + selection.width,
      bottom: shellRect.top + selection.top + selection.height
    };

    return Array.from(
      this.shell().nativeElement.querySelectorAll<HTMLElement>('[data-testid="node"][data-block-id]')
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

  private async applyZoom(multiplier: number) {
    const area = this.rete?.area?.area;
    const host = this.container()?.nativeElement as HTMLElement | undefined;
    if (!area || !host) return;

    const currentZoom = area.transform.k || 1;
    const nextZoom = Math.min(2.4, Math.max(0.35, currentZoom * multiplier));
    if (Math.abs(nextZoom - currentZoom) < 0.001) return;

    await area.zoom(nextZoom, 0, 0);
  }

  private async ensureNodeTypesLoaded() {
    if (this.blocksService.hasLoadedBlockTypes() && this.containersService.hasLoadedContainerTypes()) {
      this.initialTypesLoading.set(false);
      return;
    }

    if (this.typesLoadingPromise) {
      this.initialTypesLoading.set(true);
      await this.typesLoadingPromise;
      this.initialTypesLoading.set(false);
      return;
    }

    this.initialTypesLoading.set(true);
    this.typesLoadingPromise = Promise.all([
      this.blocksService.getAllBlocksTypes(),
      this.containersService.getAllContainerTypes()
    ]).then(() => undefined)
      .finally(() => {
        this.typesLoadingPromise = null;
        this.initialTypesLoading.set(false);
      });

    await this.typesLoadingPromise;
  }
}
