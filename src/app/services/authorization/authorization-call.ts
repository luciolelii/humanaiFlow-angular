import { AuthorizationCallServiceBase } from "./authorization-call.base";
import { User, UserRegistration } from "@models/user";
import { map, Observable } from "rxjs";
import { HttpClient } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";

export class AuthorizationCallService extends AuthorizationCallServiceBase {
    private readonly http = inject(HttpClient);

    override login(username: string, password: string): Observable<User> {
         return this.http
            .post<unknown>(`${environment.apiUrl}/auth/login`, { username, password })
            .pipe(
                map((raw) => {
                    const payload = (raw ?? {}) as Record<string, unknown>;
                    const userSource =
                      (payload["user"] as Record<string, unknown> | undefined)
                      ?? (payload["profile"] as Record<string, unknown> | undefined)
                      ?? payload;
                    const token = this.extractToken(payload, userSource);

                    return {
                        username: String(userSource["username"] ?? username),
                        email: String(userSource["email"] ?? ''),
                        token: typeof token === "string" && token.length > 0 ? token : undefined
                    } satisfies User;
                })
            );
    }
    override register(userRegistration: UserRegistration): Observable<void> {
         return this.http.post<void>(`${environment.apiUrl}/auth/register`, userRegistration);
    }

    private extractToken(...sources: Array<Record<string, unknown> | undefined>): unknown {
      const tokenKeys = ['token', 'accessToken', 'access_token', 'jwt', 'id_token'];
      for (const source of sources) {
        if (!source) continue;
        for (const key of tokenKeys) {
          const value = source[key];
          if (typeof value === 'string' && value.length > 0) {
            return value;
          }
        }
      }
      return undefined;
    }
}
