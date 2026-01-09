import { Component } from '@angular/core';
import { Accordion } from '@shared/accordion/accordion';
import { FlowsList } from '@shared/flows-list/flows-list';

type AccordionId = 'flows' | 'blocks';

@Component({
  selector: 'app-editor-sidebar',
  imports: [Accordion, FlowsList],
  templateUrl: './editor-sidebar.html',
  styleUrl: './editor-sidebar.css',
})
export class EditorSidebar {

  collapsed = false;

  openAccordion: AccordionId | null = null;

  collapse() {
    this.collapsed = !this.collapsed;
  }

  toggle(id: AccordionId) {
    this.openAccordion = this.openAccordion === id ? null : id;
  }
}
