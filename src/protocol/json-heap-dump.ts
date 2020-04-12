export interface JsonHeapDump {
    snapshot: {};
    nodes: number[];
    edges: number[];
    trace_function_infos: string[];
    trace_tree: string[];
    samples: string[];
    locations: number[];
    strings: string[];
}

