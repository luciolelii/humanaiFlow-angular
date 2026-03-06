import { TaskExecution } from '@models/task-execution';
import { Observable } from 'rxjs';

export abstract class TaskExecutionsCallServiceBase {
  abstract retrieveAllTaskExecutions(): Observable<TaskExecution[]>;
  abstract createTaskExecution(flowId: string): Observable<TaskExecution>;
  abstract deleteTaskExecution(executionId: string): Observable<void>;
  abstract startTaskExecution(executionId: string): Observable<TaskExecution>;
  abstract prepareStringInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    value: string
  ): Observable<TaskExecution>;
  abstract prepareFileInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    file: File
  ): Observable<TaskExecution>;
}
