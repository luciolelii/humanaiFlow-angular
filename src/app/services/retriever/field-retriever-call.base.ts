import { Observable } from "rxjs";

export abstract class FieldRetrieverCallServiceBase {
  abstract retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ): Observable<string[]>;

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
