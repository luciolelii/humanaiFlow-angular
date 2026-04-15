import {
  ChangePasswordRequest,
  User,
  UserRegistration,
} from "@models/user";
import { Observable } from "rxjs";

export abstract class AuthorizationCallServiceBase {
   
    abstract login(username: string, password: string): Observable<User>;

    abstract currentUser(): Observable<User>;

    abstract register(userRegistration: UserRegistration): Observable<void>;

    abstract changePassword(request: ChangePasswordRequest): Observable<void>;

    abstract logout(): Observable<void>;

}
