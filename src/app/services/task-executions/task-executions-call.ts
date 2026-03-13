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

  override deleteTaskExecution(executionId: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}`);
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

  override prepareStringArrayInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    values: string[]
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/input/${encodeURIComponent(inputName)}/texts`;
    return this.http.put<TaskExecution>(url, values);
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

  override prepareFileArrayInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    files: File[]
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/input/${encodeURIComponent(inputName)}/files`;
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return this.http.put<TaskExecution>(url, formData);
  }

  override submitInteractionText(
    executionId: string,
    nodeId: string,
    fieldName: string,
    value: string
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/interaction/${encodeURIComponent(fieldName)}/text`;
    return this.http.put<TaskExecution>(url, value, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  override provideAuthorization(
    executionId: string,
    key: string,
    value: string
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/authorizations`;
    return this.http.put<TaskExecution>(url, { key, value });
  }
}
