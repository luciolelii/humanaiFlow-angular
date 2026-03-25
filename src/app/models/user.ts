export type User = {
    username: string;
    email: string;
    token?: string;
};

export type UserRegistration = User & {
    password: string;
    fullname: string;
};

export type ChangePasswordRequest = {
    username: string;
    oldPassword: string;
    newPassword: string;
};
