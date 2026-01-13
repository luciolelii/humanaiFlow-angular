export type Flow = {
    id: string;
    name: string;
    visibility: 'public' | 'private';
    data: any;
    author: string;
    createdAt: Date;
    updatedAt: Date;
};