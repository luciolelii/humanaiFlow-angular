import { Component, EventEmitter, input, Input, Output } from '@angular/core';

@Component({
  selector: 'app-group-holder',
  imports: [],
  templateUrl: './group-holder.html',
  styleUrl: './group-holder.css',
})
export class GroupHolder {
  @Input() title = '';
  @Input() icon = '';
}
