import { Component, ElementRef, Injector, output, ViewChild } from '@angular/core';
import { BlockType, FlowBlock, FlowData } from '@models/flow';
import { BLOCK_TYPE_DRAG_MIME } from '@shared/blocks-list/block-drag';
import { EditorStateHolder } from '@stores/flow-editor';
import { addBlockToEditor, createEditor, ReteEditorInstance } from '@utilities/rete-editor';

@Component({
  selector: 'app-rete-editor',
  imports: [],
  templateUrl: './rete-editor.html',
  styleUrl: './rete-editor.css',
})
export class ReteEditor {

  flowData: FlowData;

  constructor(private injector: Injector, private flowState: EditorStateHolder ) {
    this.flowData = this.flowState.currentFlow()!.data;
  }

  @ViewChild("editor") container!: ElementRef;

  private rete?: ReteEditorInstance;

  flowChanged = output<any>();


  ngAfterViewInit(): void {
    const el = this.container.nativeElement;

    if (el) {
      createEditor(el, this.injector, this.flowData).then((rete) => {
        this.rete = rete;
        rete.editor.addPipe(
          (context) => {
            this.flowChanged.emit({});
            return context;
          }
        );
      });
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    const payload = event.dataTransfer?.getData(BLOCK_TYPE_DRAG_MIME);
    if (!payload || !this.rete) return;

    const blockType: BlockType = JSON.parse(payload);
    const position = this.getDropPosition(event);
    const newBlock = this.createBlockFromType(blockType, position);

    await addBlockToEditor(this.rete.editor, this.rete.area, newBlock, position);
    this.flowChanged.emit({});
  }

  private getDropPosition(event: DragEvent) {
    const host = this.container.nativeElement as HTMLElement;
    const rect = host.getBoundingClientRect();
    const transform = this.rete!.area.area.transform;

    const x = (event.clientX - rect.left - transform.x) / transform.k;
    const y = (event.clientY - rect.top - transform.y) / transform.k;
    return { x, y };
  }

  private createBlockFromType(blockType: BlockType, position: { x: number; y: number }): FlowBlock {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    const common = {
      id,
      sink: false,
      name: blockType.name,
      position,
      typeName: blockType.name
    } as const;

    if (blockType.name === 'SourceBlock') {
      return {
        ...common,
        inputs: [],
        outputs: [{ name: 'output', type: 'TEXT', multiple: false }],
        specificConfiguration: {}
      };
    }

    if (blockType.name === 'HumanInteractionBlock') {
      return {
        ...common,
        sink: true,
        inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
        outputs: [{ name: 'output', type: 'TEXT', multiple: false }],
        specificConfiguration: {
          type: 'HumanInteractiveBlockConfiguration',
          name: blockType.name,
          actionDescription: 'Human task',
          llmDescriptor: { provider: 'default', model: 'default' },
          inputAsList: false,
          outputAsList: false
        }
      };
    }

    return {
      ...common,
      inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
      outputs: [{ name: 'output', type: 'TEXT', multiple: false }],
      specificConfiguration: {
        type: 'LLMBlockConfiguration',
        name: blockType.name,
        llmDescriptor: { provider: 'default', model: 'default' },
        prompt: ''
      }
    };
  }
}
