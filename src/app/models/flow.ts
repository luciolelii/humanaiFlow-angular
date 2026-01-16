export type FlowVisibility = 'public' | 'private';



export type Flow = {
    id: string;
    name: string;
    visibility: FlowVisibility;
    data: FlowData;
    author: string;
    createdAt: Date;
    updatedAt: Date;
};

export class FlowData {
    
    constructor(public nodes: any[] = [], public edges: any[] = []) {}
};
