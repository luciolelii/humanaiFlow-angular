import { Component, ElementRef, Injector, input, OnChanges, OnDestroy, output, SimpleChanges, ViewChild } from '@angular/core';
import { BlockType, FlowBlock, FlowData } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { BLOCK_TYPE_DRAG_MIME } from '@shared/blocks-list/block-drag';
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

  private rete?: ReteEditorInstance;
  private viewReady = false;
  private loadVersion = 0;
  creatingEmptyBlock = false;
  creatingEmptyBlockType = '';
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
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  async onDrop(event: DragEvent) {
    if (this.readonly()) return;
    event.preventDefault();
    const payload = event.dataTransfer?.getData(BLOCK_TYPE_DRAG_MIME);
    if (!payload || !this.rete) return;

    const blockType: BlockType = JSON.parse(payload);
    const position = this.getDropPosition(event);
    let newBlock: FlowBlock;
    this.creatingEmptyBlock = true;
    this.creatingEmptyBlockType = blockType.type;
    try {
      newBlock = await firstValueFrom(this.blocksService.createEmptyBlock(blockType.type));
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

  private async reloadEditor() {
    const host = this.container?.nativeElement as HTMLElement | undefined;
    if (!host) return;

    const currentVersion = ++this.loadVersion;
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
    if (!this.readonly()) {
      rete.editor.addPipe((context) => {
        if (this.dirtyEventTypes.has(context.type)) {
          this.markFlowChanged(rete, context);
        }
        return context;
      });

      rete.area.addPipe((context: any) => {
        if (context?.type === 'nodetranslated') {
          this.markFlowChanged(rete, context);
        }
        return context;
      });
    }
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
  }

  private markFlowChanged(rete: ReteEditorInstance, context: any) {
    if (this.readonly()) return;
    this.syncNodePositionFromContext(rete, context);
    if (this.flowState.currentFlow()?.id !== this.flowId()) return;

    const updatedData = exportGraph(rete.editor);
    this.flowState.updateData(updatedData);
    this.flowChanged.emit(updatedData);
  }
}
