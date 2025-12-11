import { User } from "@models/user";
import { Observable } from "rxjs";

export abstract class AuthorizationCallServiceBase {
   
    abstract login(username: string, password: string): Observable<User>;

    abstract register(username: string, password: string, email: string): Observable<void>;

}