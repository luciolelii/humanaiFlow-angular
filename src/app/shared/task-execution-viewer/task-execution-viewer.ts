import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { TaskExecutionListItem } from '@shared/tasks-executions-list/tasks-executions-list';

@Component({
  selector: 'app-task-execution-viewer',
  imports: [CommonModule],
  templateUrl: './task-execution-viewer.html',
  styleUrl: './task-execution-viewer.css',
})
export class TaskExecutionViewerComponent {
  readonly execution = input<TaskExecutionListItem | null>(null);
}
