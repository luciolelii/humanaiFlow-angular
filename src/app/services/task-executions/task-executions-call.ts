import { TaskExecution } from '@models/task-execution';
import { Observable } from 'rxjs';
import { TaskExecutionsCallServiceBase } from './task-executions-call.base';

export class TaskExecutionsCallService extends TaskExecutionsCallServiceBase {
  override retrieveAllTaskExecutions(): Observable<TaskExecution[]> {
    throw new Error('Method not implemented.');
  }
}

