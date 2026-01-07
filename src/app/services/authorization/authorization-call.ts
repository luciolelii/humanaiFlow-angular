import { HttpClient } from "@angular/common/http";
import { AuthorizationCallServiceBase } from "./authorization-call.base";
import { inject } from "@angular/core";
import { User, UserRegistration } from "@models/user";
import { Observable } from "rxjs";

export class AuthorizationCallService extends AuthorizationCallServiceBase {

    private readonly httpClient = inject(HttpClient);

    override login(username: string, password: string): Observable<User> {
         throw new Error("Method not implemented.");
    }
    override register(userRegistration: UserRegistration): Observable<void> {
         throw new Error("Method not implemented.");
    }
    
    

}