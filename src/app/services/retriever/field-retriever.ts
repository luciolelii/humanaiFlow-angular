import { Injectable } from '@angular/core';
import { environment } from '@environment';
import { catchError, throwError } from 'rxjs';
import { FieldRetrieverCallServiceBase, RetrieverStructuredItem } from './field-retriever-call.base';

@Injectable({
  providedIn: 'root',
})
export class FieldRetriever {
  fieldRetrieverCallService: FieldRetrieverCallServiceBase = new environment.fieldRetrieverCallService();

  retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ) {
    return this.fieldRetrieverCallService.retrieveValues(blockType, key, context, retrieverUrl).pipe(
      catchError((err) => {
        console.error('Field retrieval failed', err);
        return throwError(() => err);
      })
    );
  }

  retrieveItems<T = unknown>(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ) {
    return this.fieldRetrieverCallService.retrieveItems<T>(blockType, key, context, retrieverUrl).pipe(
      catchError((err) => {
        console.error('Structured field retrieval failed', err);
        return throwError(() => err);
      })
    );
  }

  isFieldRequired(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ) {
    return this.fieldRetrieverCallService.isFieldRequired(blockType, key, context, retrieverUrl).pipe(
      catchError((err) => {
        console.error('Field required check failed', err);
        return throwError(() => err);
      })
    );
  }

  retrieveSchema(
    schemaUrl: string,
    context?: Record<string, string>
  ) {
    return this.fieldRetrieverCallService.retrieveSchema(schemaUrl, context).pipe(
      catchError((err) => {
        console.error('Schema retrieval failed', err);
        return throwError(() => err);
      })
    );
  }
}
