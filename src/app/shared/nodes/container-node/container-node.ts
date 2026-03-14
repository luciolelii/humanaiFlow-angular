import { CommonModule } from '@angular/common';
import { Component, HostBinding, Input, inject } from '@angular/core';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { currentFlowPortValueKind, flowValueKindLabel, FlowData, FlowNode, FlowSubflowValidationError } from '@models/flow';
import { SubflowPreviewDialogService } from '@services/dialogs/subflow-preview-dialog';
import { EditorStateHolder } from '@stores/flow-editor';
import { pathToLabel } from '../node-utility';
import { CONTAINER_SUBFLOW_DRAG_MIME } from './container-node-drag';

@Component({
  selector: 'app-container-node',
  imports: [CommonModule, ReteModule],
  templateUrl: './container-node.html',
  styleUrl: './container-node.css',
  host: {
    'data-testid': 'node'
  }
})
export class ContainerNodeComponent {
  private editorState = inject(EditorStateHolder);
  private subflowPreview = inject(SubflowPreviewDialogService);

  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  @HostBinding('class.selected') get selected() {
    return this.data.selected || this.editorState.isBlockSelected(this.blockId);
  }

  @HostBinding('attr.data-block-id') get hostBlockId() {
    return this.blockId;
  }

  ngAfterViewInit() {
    this.rendered();
  }

  get name() {
    return String(this.configuration?.['name'] ?? this.data?.data?.name ?? 'Container');
  }

  get inputs() {
    return Object.entries(this.data?.inputs ?? {}).map(([key, input]) => ({
      key,
      socket: (input as any).socket as ClassicPreset.Socket
    }));
  }

  get outputs() {
    return Object.entries(this.data?.outputs ?? {}).map(([key, output]) => ({
      key,
      socket: (output as any).socket as ClassicPreset.Socket
    }));
  }

  get selectedCount() {
    return this.editorState.selectedBlockIds().filter((id) => id !== this.blockId).length;
  }

  get subFlow(): FlowData | null {
    const value = this.configuration?.['subFlow'];
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<FlowData>;
    const blocks = Array.isArray(candidate.blocks) ? candidate.blocks : [];
    const containers = Array.isArray(candidate.containers) ? candidate.containers : [];
    const connections = Array.isArray(candidate.connections) ? candidate.connections : [];

    if (!blocks.length && !containers.length && !connections.length) {
      return null;
    }

    return {
      blocks,
      containers,
      connections
    };
  }

  get subFlowBlockCount() {
    return (this.subFlow?.blocks?.length ?? 0) + (this.subFlow?.containers?.length ?? 0);
  }

  get subFlowConnectionCount() {
    return this.subFlow?.connections?.length ?? 0;
  }

  get subFlowPreviewNodes() {
    const subFlow = this.subFlow;
    if (!subFlow) return [];
    return [...(subFlow.blocks ?? []), ...(subFlow.containers ?? [])]
      .slice(0, 6)
      .map((node) => this.toPreviewNode(node));
  }

  get hasMoreSubFlowNodes() {
    return this.subFlowBlockCount > this.subFlowPreviewNodes.length;
  }

  get validationErrors(): FlowSubflowValidationError[] {
    const errors = this.data?.data?.['__containerValidationErrors'];
    return Array.isArray(errors) ? errors : [];
  }

  get assignmentErrorMessage() {
    const value = this.data?.data?.['__containerAssignmentError'];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  get isAssigning() {
    return this.data?.data?.['__containerAssigning'] === true;
  }

  inputDisplayLabel(inputKey: string) {
    return pathToLabel(inputKey);
  }

  outputDisplayLabel(outputKey: string) {
    return pathToLabel(outputKey);
  }

  inputKindLabel(inputKey: string) {
    const port = this.inputs.find((candidate) => candidate.key === inputKey);
    return port ? flowValueKindLabel(currentFlowPortValueKind((this.data?.data?.inputs ?? []).find((item: any) => item?.name === inputKey) ?? { type: 'ANY', multiple: false })) : 'ANY';
  }

  outputKindLabel(outputKey: string) {
    const port = this.outputs.find((candidate) => candidate.key === outputKey);
    return port ? flowValueKindLabel(currentFlowPortValueKind((this.data?.data?.outputs ?? []).find((item: any) => item?.name === outputKey) ?? { type: 'ANY', multiple: false })) : 'ANY';
  }

  onDropZoneDragOver(event: DragEvent) {
    if (!this.canAcceptSelectionDrop()) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDropZoneDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const raw = event.dataTransfer?.getData(CONTAINER_SUBFLOW_DRAG_MIME);
    const payload = this.parseDraggedSelection(raw);
    const assign = this.data?.data?.assignSelectedBlocksToContainer;
    if (!payload.length || typeof assign !== 'function') return;

    void assign(payload);
    this.editorState.stopDraggingSelectedBlocks();
  }

  onDropZoneDragLeave(_: DragEvent) {
    this.editorState.stopDraggingSelectedBlocks();
  }

  removeSubflow(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const clear = this.data?.data?.clearContainerSubflow;
    if (typeof clear === 'function') {
      void clear();
    }
  }

  deleteNode(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const remove = this.data?.data?.deleteNode;
    if (typeof remove === 'function') {
      void remove();
    }
  }

  openSubflowPreview(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.subFlow) return;
    this.subflowPreview.open(this.subFlow, `${this.name} subflow`);
  }

  private get configuration(): Record<string, unknown> | null {
    const value = this.data?.data?.specificConfiguration;
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  }

  private get blockId(): string | null {
    const blockId = this.data?.data?.id;
    return typeof blockId === 'string' && blockId.length > 0 ? blockId : null;
  }

  private canAcceptSelectionDrop() {
    return !this.isAssigning && this.selectedCount > 0;
  }

  private parseDraggedSelection(raw: string | undefined) {
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
    } catch {
      return [];
    }
  }

  private toPreviewNode(node: FlowNode) {
    return {
      id: node.id,
      name: String(node.name ?? node.typeName ?? 'Node'),
      type: this.nodeTypeLabel(String(node.typeName ?? 'Node')),
      family: node.nodeFamily === 'container' ? 'container' : 'block'
    };
  }

  private nodeTypeLabel(typeName: string) {
    if (typeName === 'HumanInteractionBlock') return 'Human Task';
    return pathToLabel(typeName.replace(/Block$/, ''));
  }
}
