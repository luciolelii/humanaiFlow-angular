export type User = {
    username: string;
    email: string;
    token?: string;
};

export type UserRegistration = User & {
    password: string;
    fullname: string;
}
