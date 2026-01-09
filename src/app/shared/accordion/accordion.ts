import { Component, EventEmitter, input, Input, Output } from '@angular/core';

@Component({
  selector: 'app-accordion',
  imports: [],
  templateUrl: './accordion.html',
  styleUrl: './accordion.css',
})
export class Accordion {
  @Input() title = '';
  @Input() icon = '';
  open = input<boolean>(false);
  @Output() toggle = new EventEmitter<void>();
}
