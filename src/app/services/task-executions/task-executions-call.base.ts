import { TaskExecution } from '@models/task-execution';
import { Observable } from 'rxjs';

export abstract class TaskExecutionsCallServiceBase {
  abstract retrieveAllTaskExecutions(): Observable<TaskExecution[]>;
}

