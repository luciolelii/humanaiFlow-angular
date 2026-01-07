import { User, UserRegistration } from "@models/user";
import { Observable } from "rxjs";

export abstract class AuthorizationCallServiceBase {
   
    abstract login(username: string, password: string): Observable<User>;

    abstract register(userRegistration: UserRegistration): Observable<void>;

}