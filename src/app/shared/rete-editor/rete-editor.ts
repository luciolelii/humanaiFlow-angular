import { Component, ElementRef, Injector, Input, input, output, ViewChild } from '@angular/core';
import { FlowData } from '@models/flow';
import { EditorStateHolder } from '@stores/flow-editor';
import { createEditor } from '@utilities/rete-editor';

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

    
  flowChanged = output<any>();


  ngAfterViewInit(): void {
    const el = this.container.nativeElement;

    if (el) {
      createEditor(el, this.injector, this.flowData).then(editor => {
        console.log("Rete editor created:", editor);
        editor.addPipe(
          (context) => {
            this.flowChanged.emit({});
            return context;
          }
        )
      });
    }
  }

}
