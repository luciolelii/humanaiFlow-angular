import { Observable } from "rxjs";
import { AuthorizationCallServiceBase } from "./authorization-call.base";
import { User } from "@models/user";

export class AuthorizationCallFakeService extends AuthorizationCallServiceBase {
    

   private users: User[] = [
       { id: 1, email: 'testuser@example.com' },
   ];

     login(email: string, password: string): Observable<User> {
         return new Observable<User>((observer) => {
               const user = this.users.find(u => u.email === email);
               if (!user || password !== 'password') {
                   observer.error(new Error('Invalid username or password'));
                   return;
               }
               observer.next(user);
               observer.complete();
         });
    }

   register(username: string, password: string, email: string): Observable<void> {
         return new Observable<void>((observer) => {
               // Simulate a successful registration response
               if (this.users.find(user => user.email === email)) {
                   observer.error(new Error('Email already exists'));
                   return;
               }
               this.users.push({ id: this.users.length + 1, email });
               observer.next();
               observer.complete();
         });
    } 





     
 }