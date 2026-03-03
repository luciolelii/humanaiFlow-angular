import { Injectable } from '@angular/core';
import { environment } from '@environment';
import { catchError, throwError } from 'rxjs';
import { FieldRetreiverCallServiceBase } from './field-retreiver-call.base';

@Injectable({
  providedIn: 'root',
})
export class FieldRetreiver {
  fieldRetreiverCallService: FieldRetreiverCallServiceBase = new environment.fieldRetreiverCallService();

  retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>
  ) {
    return this.fieldRetreiverCallService.retrieveValues(blockType, key, context).pipe(
      catchError((err) => {
        console.error('Field retrieval failed', err);
        return throwError(() => err);
      })
    );
  }

  isFieldRequired(
    blockType: string,
    key: string,
    context?: Record<string, string>
  ) {
    return this.fieldRetreiverCallService.isFieldRequired(blockType, key, context).pipe(
      catchError((err) => {
        console.error('Field required check failed', err);
        return throwError(() => err);
      })
    );
  }
}
