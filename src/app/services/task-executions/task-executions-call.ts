import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '@environment';
import { TaskExecution } from '@models/task-execution';
import { Observable } from 'rxjs';
import { TaskExecutionsCallServiceBase } from './task-executions-call.base';

export class TaskExecutionsCallService extends TaskExecutionsCallServiceBase {
  private readonly http = inject(HttpClient);

  override retrieveAllTaskExecutions(): Observable<TaskExecution[]> {
    return this.http.get<TaskExecution[]>(`${environment.apiUrl}/executions`);
  }

  override createTaskExecution(flowId: string): Observable<TaskExecution> {
    return this.http.post<TaskExecution>(`${environment.apiUrl}/executions`, flowId);
  }

  override startTaskExecution(executionId: string): Observable<TaskExecution> {
    return this.http.put<TaskExecution>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/start`, null);
  }

  override prepareStringInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    value: string
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/input/${encodeURIComponent(inputName)}/text`;
    return this.http.put<TaskExecution>(url, value, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  override prepareFileInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    file: File
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/input/${encodeURIComponent(inputName)}/file`;
    const formData = new FormData();
    formData.append('file', file);
    return this.http.put<TaskExecution>(url, formData);
  }
}
