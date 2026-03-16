import { CommonModule } from '@angular/common';
import { Component, HostBinding, Input, inject } from '@angular/core';
import { currentFlowPortValueKind, flowValueKindLabel, FlowBlock, FlowContainer, FlowData, FlowNode } from '@models/flow';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { ContainersService } from '@services/containers/containers';
import { FieldRetriever } from '@services/retriever/field-retriever';
import { ClassicPreset } from 'rete';
import { ReteModule } from 'rete-angular-plugin/21';
import { SubflowPreviewDialogService } from '@services/dialogs/subflow-preview-dialog';
import { EditorStateHolder } from '@stores/flow-editor';
import { pathToLabel } from '../node-utility';
import { CONTAINER_SUBFLOW_DRAG_MIME } from './container-node-drag';
import { firstValueFrom } from 'rxjs';

type StructuredRetrieverConfig = {
  retrieverName: string;
  retrieverUrl: string;
  validationUrl: string | null;
  structuredData: boolean;
  requiresAuth: boolean;
};

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
  private fieldRetriever = inject(FieldRetriever);
  private containersService = inject(ContainersService);
  private settingsDialog = inject(NodeSettingsDialogService);
  deleteConfirmOpen = false;
  replaceConfirmSelection: string[] | null = null;
  importLoading = false;
  private importErrorMessage: string | null = null;

  @Input() data!: any;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  @HostBinding('class.selected') get selected() {
    return this.data.selected || this.editorState.isBlockSelected(this.blockId);
  }

  @HostBinding('attr.data-block-id') get hostBlockId() {
    return this.blockId;
  }

  @HostBinding('class.container-node--readonly') get readonlyClass() {
    return this.isReadonly;
  }

  ngAfterViewInit() {
    this.rendered();
  }

  get isReadonly() {
    return this.data?.data?.['__readonly'] === true;
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
    const candidate = value as Record<string, unknown>;
    const blocks = this.normalizeSubFlowBlocks(candidate['blocks']);
    const containers = this.normalizeSubFlowContainers(candidate['containers']);
    const connections = Array.isArray(candidate['connections'])
      ? candidate['connections'].filter((item): item is FlowData['connections'][number] => !!item && typeof item === 'object')
      : [];

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

  get subFlowSnapshotNodes() {
    const subFlow = this.subFlow;
    if (!subFlow) return [];

    const allNodes = [...(subFlow.blocks ?? []), ...(subFlow.containers ?? [])];
    if (!allNodes.length) return [];

    const positioned = allNodes.map((node) => ({
      id: node.id,
      family: node.nodeFamily === 'container' ? 'container' : 'block',
      x: typeof node.position?.x === 'number' ? node.position.x : 0,
      y: typeof node.position?.y === 'number' ? node.position.y : 0,
      width: node.nodeFamily === 'container' ? 24 : 18,
      height: node.nodeFamily === 'container' ? 14 : 12
    }));

    const minX = Math.min(...positioned.map((node) => node.x));
    const minY = Math.min(...positioned.map((node) => node.y));
    const maxX = Math.max(...positioned.map((node) => node.x + node.width));
    const maxY = Math.max(...positioned.map((node) => node.y + node.height));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    return positioned.map((node) => ({
      id: node.id,
      family: node.family,
      left: 6 + ((node.x - minX) / spanX) * 100,
      top: 6 + ((node.y - minY) / spanY) * 52,
      width: node.width,
      height: node.height
    }));
  }

  get replaceConfirmOpen() {
    return Array.isArray(this.replaceConfirmSelection) && this.replaceConfirmSelection.length > 0;
  }

  get assignmentErrorMessage() {
    const value = this.data?.data?.['__containerAssignmentError'];
    if (typeof value === 'string' && value.length > 0) return value;
    return this.importErrorMessage;
  }

  get isAssigning() {
    return this.data?.data?.['__containerAssigning'] === true;
  }

  get missingRequiredParams() {
    const missing: string[] = [];
    if (!this.name.trim()) {
      missing.push('Name');
    }
    if (!this.subFlow) {
      missing.push('Sub Flow');
    }
    return missing;
  }

  inputDisplayLabel(inputKey: string) {
    return this.resolvePortName('input', inputKey);
  }

  outputDisplayLabel(outputKey: string) {
    return this.resolvePortName('output', outputKey);
  }

  inputKindLabel(inputKey: string) {
    const port = this.resolvePortDefinition('input', inputKey);
    return port ? flowValueKindLabel(currentFlowPortValueKind(port)) : 'ANY';
  }

  outputKindLabel(outputKey: string) {
    const port = this.resolvePortDefinition('output', outputKey);
    return port ? flowValueKindLabel(currentFlowPortValueKind(port)) : 'ANY';
  }

  inputDisplayLabelParts(inputKey: string) {
    return this.toPortLabelParts(this.inputDisplayLabel(inputKey));
  }

  outputDisplayLabelParts(outputKey: string) {
    return this.toPortLabelParts(this.outputDisplayLabel(outputKey));
  }

  async importSubflow(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly || this.importLoading || this.replaceConfirmOpen) return;

    this.importLoading = true;
    this.importErrorMessage = null;

    try {
      const retriever = await this.resolveStructuredRetrieverConfig();
      if (!retriever || !retriever.structuredData) {
        this.importErrorMessage = 'Subflow import is not available for this container.';
        return;
      }

      const items = await firstValueFrom(
        this.fieldRetriever.retrieveItems<FlowData>(
          retriever.retrieverName || this.typeName,
          'subFlow',
          {
            context: 'CONTAINER',
            validOnly: 'true',
            includeValidation: 'false'
          },
          retriever.retrieverUrl
        )
      );

      if (!items.length) {
        this.importErrorMessage = 'No importable flows were returned by the retriever.';
        return;
      }

      const result = await this.settingsDialog.open({
        title: 'Import flow into container',
        fields: [
          {
            key: 'selectedFlow',
            label: 'Available flows',
            type: 'select',
            required: true,
            options: items.map((item, index) => ({
              value: String(index),
              label: item.descriptor.description
                ? `${item.descriptor.label} - ${item.descriptor.description}`
                : item.descriptor.label
            }))
          }
        ],
        initial: {
          selectedFlow: '0'
        }
      });
      if (!result) return;

      const selectedIndex = Number(result['selectedFlow'] ?? -1);
      const selectedItem = Number.isInteger(selectedIndex) ? items[selectedIndex] : undefined;
      if (!selectedItem?.data) {
        this.importErrorMessage = 'Invalid flow selection.';
        return;
      }

      const assignImportedSubflow = this.data?.data?.assignImportedSubflow;
      if (typeof assignImportedSubflow !== 'function') {
        this.importErrorMessage = 'Container import is not available in the editor runtime.';
        return;
      }

      await assignImportedSubflow(selectedItem.data, retriever.validationUrl);
    } catch {
      this.importErrorMessage = 'Failed to load importable flows.';
    } finally {
      this.importLoading = false;
    }
  }

  onDropZoneDragOver(event: DragEvent) {
    if (this.isReadonly) return;
    if (!this.canAcceptSelectionDrop()) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDropZoneDrop(event: DragEvent) {
    if (this.isReadonly) return;
    event.preventDefault();
    event.stopPropagation();

    const raw = event.dataTransfer?.getData(CONTAINER_SUBFLOW_DRAG_MIME);
    const payload = this.parseDraggedSelection(raw);
    if (!payload.length) return;

    if (this.subFlowBlockCount > 0) {
      this.replaceConfirmSelection = payload;
      this.editorState.stopDraggingSelectedBlocks();
      return;
    }

    this.assignSelectionToContainer(payload);
  }

  onDropZoneDragLeave(_: DragEvent) {
    if (this.isReadonly) return;
    this.editorState.stopDraggingSelectedBlocks();
  }

  confirmReplaceSubflow(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;

    const payload = this.replaceConfirmSelection;
    this.replaceConfirmSelection = null;
    if (!payload?.length) return;

    this.assignSelectionToContainer(payload);
  }

  cancelReplaceSubflow(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.replaceConfirmSelection = null;
  }

  deleteNode(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isReadonly) return;
    if (!this.deleteConfirmOpen) {
      this.deleteConfirmOpen = true;
      return;
    }

    const remove = this.data?.data?.deleteNode;
    if (typeof remove === 'function') {
      void remove();
    }
  }

  cancelDelete(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.deleteConfirmOpen = false;
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

  private get typeName(): string {
    return String(this.data?.data?.typeName ?? 'GenericContainer');
  }

  private canAcceptSelectionDrop() {
    return !this.isAssigning && !this.replaceConfirmOpen && this.selectedCount > 0;
  }

  private assignSelectionToContainer(payload: string[]) {
    this.importErrorMessage = null;
    const assign = this.data?.data?.assignSelectedBlocksToContainer;
    if (typeof assign !== 'function' || !payload.length) return;

    void assign(payload);
    this.editorState.stopDraggingSelectedBlocks();
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

  private resolvePortName(kind: 'input' | 'output', key: string) {
    const port = this.resolvePortDefinition(kind, key);
    return typeof port?.name === 'string' && port.name.length > 0 ? port.name : key;
  }

  private toPortLabelParts(label: string) {
    const trimmed = String(label ?? '').trim();
    const separatorIndex = trimmed.lastIndexOf('.');
    if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
      return {
        context: null,
        name: trimmed
      };
    }

    return {
      context: trimmed.slice(0, separatorIndex),
      name: trimmed.slice(separatorIndex + 1)
    };
  }

  private resolvePortDefinition(kind: 'input' | 'output', key: string) {
    const ports = this.data?.data?.[kind === 'input' ? 'inputs' : 'outputs'];
    if (!Array.isArray(ports)) return null;
    return ports.find((item: any) => item?.name === key) ?? null;
  }

  private toPreviewNode(node: FlowNode) {
    return {
      id: node.id,
      name: String(node.name ?? node.typeName ?? 'Node'),
      type: this.nodeTypeLabel(String(node.typeName ?? 'Node')),
      family: node.nodeFamily === 'container' ? 'container' : 'block'
    };
  }

  private normalizeSubFlowBlocks(raw: unknown): FlowBlock[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        ...item,
        position: this.normalizePosition(item['position']),
        nodeFamily: 'block'
      })) as FlowBlock[];
  }

  private normalizeSubFlowContainers(raw: unknown): FlowContainer[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        ...item,
        position: this.normalizePosition(item['position']),
        nodeFamily: 'container'
      })) as FlowContainer[];
  }

  private normalizePosition(raw: unknown): { x: number; y: number } | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as Record<string, unknown>;
    const x = typeof value['x'] === 'number' ? value['x'] : Number(value['x']);
    const y = typeof value['y'] === 'number' ? value['y'] : Number(value['y']);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return { x, y };
  }

  private async resolveStructuredRetrieverConfig(): Promise<StructuredRetrieverConfig | null> {
    const containerType = await this.containersService.getContainerType(this.typeName);
    const schema = containerType?.schema;
    const properties = schema?.['properties'];
    const propertySchema = properties && typeof properties === 'object' && !Array.isArray(properties)
      ? (properties as Record<string, unknown>)['subFlow']
      : null;

    if (!propertySchema || typeof propertySchema !== 'object' || Array.isArray(propertySchema)) {
      return null;
    }

    const fieldSchema = propertySchema as Record<string, unknown>;
    const retrieverUrl = typeof fieldSchema['x-retriever-url'] === 'string' ? fieldSchema['x-retriever-url'] : null;
    const retrieverName = typeof fieldSchema['x-retriever-name'] === 'string' ? fieldSchema['x-retriever-name'] : this.typeName;
    if (!retrieverUrl) return null;

    return {
      retrieverName,
      retrieverUrl,
      validationUrl: typeof fieldSchema['x-retriever-validation-url'] === 'string'
        ? fieldSchema['x-retriever-validation-url']
        : null,
      structuredData: fieldSchema['x-retriever-structured-data'] === true,
      requiresAuth: fieldSchema['x-retriever-requires-auth'] === true
    };
  }

  private nodeTypeLabel(typeName: string) {
    if (typeName === 'HumanInteractionBlock') return 'Human Task';
    return pathToLabel(typeName.replace(/Block$/, ''));
  }
}
