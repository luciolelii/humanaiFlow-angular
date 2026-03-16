import { Observable } from "rxjs";

export type RetrieverStructuredItemDescriptor = {
  label: string;
  description?: string;
  meta?: Record<string, unknown>;
};

export type RetrieverStructuredItem<T = unknown> = {
  descriptor: RetrieverStructuredItemDescriptor;
  data: T;
  structuredData: boolean;
  valid?: boolean;
  validationErrors?: unknown[];
};

export abstract class FieldRetrieverCallServiceBase {
  abstract retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ): Observable<string[]>;

  abstract retrieveItems<T = unknown>(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ): Observable<RetrieverStructuredItem<T>[]>;

  abstract isFieldRequired(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ): Observable<boolean>;

  abstract retrieveSchema(
    schemaUrl: string,
    context?: Record<string, string>
  ): Observable<Record<string, unknown> | null>;
}
