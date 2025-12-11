import { AuthorizationCallFakeService } from "@services/authorization/authorization-call.fake";

export const environment = {
    production: false,
    apiUrl: 'http://localhost:8080',
    authorizationCallService: AuthorizationCallFakeService, // Assign the appropriate service here
};
