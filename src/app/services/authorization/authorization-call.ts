import { AuthorizationCallServiceBase } from "./authorization-call.base";
import { User, UserRegistration } from "@models/user";
import { Observable } from "rxjs";

export class AuthorizationCallService extends AuthorizationCallServiceBase {
    override login(_username: string, _password: string): Observable<User> {
         throw new Error("Method not implemented.");
    }
    override register(_userRegistration: UserRegistration): Observable<void> {
         throw new Error("Method not implemented.");
    }
    
    

}
