import { Observable } from "rxjs";

export abstract class FieldRetreiverCallServiceBase {
  abstract retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>
  ): Observable<string[]>;
}
