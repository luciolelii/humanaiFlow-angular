export type User = {
    username: string;
    email: string;
};

export type UserRegistration = User & {
    password: string;
    fullname: string;
}