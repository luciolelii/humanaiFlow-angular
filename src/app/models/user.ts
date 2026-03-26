export type UserRole = 'USER' | 'ADMIN';

export type User = {
    username: string;
    email: string | null;
    role: UserRole;
    token?: string;
};

export type UserRegistration = {
    username: string;
    password: string;
    email: string;
    captchaToken?: string;
};

export type ChangePasswordRequest = {
    username: string;
    oldPassword: string;
    newPassword: string;
};

export type AdminUser = {
    username: string;
    email: string | null;
    role: UserRole;
};

export type AdminCreateUserRequest = {
    username: string;
    password: string;
    email: string;
    role?: UserRole | null;
};

export type AdminResetPasswordRequest = {
    newPassword: string;
};

export type AdminChangeRoleRequest = {
    role: UserRole;
};

export type UserStatistics = {
    username: string;
    flowsCreated: number;
    flowsPublished: number;
    flowsFinalized: number;
    executionsCreated: number;
    executionsRunning: number;
    executionsSucceeded: number;
    executionsFailed: number;
    simulationsStarted: number;
    lastFlowUpdateAt: string | null;
    lastExecutionAt: number | null;
};

export type OperationsStatistics = {
    usersCount: number;
    flowsCreated: number;
    flowsPublished: number;
    flowsFinalized: number;
    executionsCreated: number;
    executionsRunning: number;
    executionsSucceeded: number;
    executionsFailed: number;
    simulationsStarted: number;
    lastFlowUpdateAt: string | null;
    lastExecutionAt: number | null;
};
