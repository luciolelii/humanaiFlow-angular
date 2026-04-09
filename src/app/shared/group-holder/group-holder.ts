import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-group-holder',
  imports: [],
  templateUrl: './group-holder.html',
  styleUrl: './group-holder.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GroupHolder {
  @Input() title = '';
  @Input() icon = '';
}
