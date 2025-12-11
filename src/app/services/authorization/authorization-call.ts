import { HttpClient } from "@angular/common/http";
import { AuthorizationCallServiceBase } from "./authorization-call.base";
import { inject } from "@angular/core";
import { User } from "@models/user";
import { Observable } from "rxjs";

export class AuthorizationCallService extends AuthorizationCallServiceBase {

    private readonly httpClient = inject(HttpClient);

    override login(username: string, password: string): Observable<User> {
         throw new Error("Method not implemented.");
    }
    override register(username: string, password: string, email: string): Observable<void> {
         throw new Error("Method not implemented.");
    }
    
    

}