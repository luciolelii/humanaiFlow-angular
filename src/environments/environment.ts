import { AuthorizationCallService } from "@services/authorization/authorization-call";

export const environment = {
        apiUrl: '/api',
        production: true,
        authorizationCallService: AuthorizationCallService,
};
