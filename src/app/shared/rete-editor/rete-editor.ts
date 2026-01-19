import { Component, ElementRef, Injector, ViewChild } from '@angular/core';
import { createEditor } from '@utilities/rete-editor';

@Component({
  selector: 'app-rete-editor',
  imports: [],
  templateUrl: './rete-editor.html',
  styleUrl: './rete-editor.css',
})
export class ReteEditor {

  constructor(private injector: Injector) {}

  @ViewChild("editor") container!: ElementRef;

  ngAfterViewInit(): void {
    const el = this.container.nativeElement;

    if (el) {
      createEditor(el, this.injector);
    }
  }
}
