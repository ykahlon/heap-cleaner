import {JsonHeapDump} from "./protocol/json-heap-dump";
import {Edge, HeapNode} from "./protocol/heap-node";

// TODO: consider parsing node/edge types (hardcoded right now)
// TODO: check if need to modify functions, trace, samples etc
// TODO: check what's the meaning of 'name_or_index' in edge
export class GraphManager {
    private nodeMap = new Map<number, HeapNode>();

    constructor(private readonly jsonHeapDump: JsonHeapDump) {
        this.constructGraph();
    }

    constructGraph() {
        for (let i = 0; i < this.jsonHeapDump.nodes.length; i += 6) {
            let heapNode = new HeapNode(this.jsonHeapDump.nodes.slice(i, i + 6), i);
            this.nodeMap.set(i, heapNode);
        }
        let currentEdgeIndex = 0;
        for (const node of this.getSortedNodes()) {
            for (let i = currentEdgeIndex; i < currentEdgeIndex + node.getOriginalEdgeCount() * 3; i += 3) {
                const [type, nameOrIndexToStrings, toNodeOriginalIndex] = this.jsonHeapDump.edges.slice(i, i + 3);
                const edge: Edge = {type, nameOrIndexToStrings};
                const toNode = this.nodeMap.get(toNodeOriginalIndex)!;
                node.connectNextNode(toNode, edge);
                toNode.connectPrevNode(node);
            }
        }
    }

    // "node_fields":["type","name","id","self_size","edge_count","trace_node_id"
    exportGraphToJson(): string {
        const sortedNodes = this.getSortedNodes();
        this.jsonHeapDump.nodes = [];
        this.jsonHeapDump.edges = [];
        const nodeIndices = new Map<HeapNode, number>();
        for (const heapNode of sortedNodes) {
            heapNode.originalNodeFields[4] = heapNode.getEdgeCount();
            nodeIndices.set(heapNode, this.jsonHeapDump.nodes.length);
            this.jsonHeapDump.nodes.push(...heapNode.originalNodeFields);
        }
        for (const heapNode of sortedNodes) {
            for (const [nextNode, edge] of heapNode.getNextEdges().entries()) {
                // TODO: casting to number even though it may be a string
                this.jsonHeapDump.edges.push(edge.type, edge.nameOrIndexToStrings as number, nodeIndices.get(nextNode)!);
            }
        }

        return JSON.stringify(this.jsonHeapDump);
    }

    private getSortedNodes(): HeapNode[] {
        return [...this.nodeMap.values()]
            .sort((a, b) => a.originalIndex - b.originalIndex);
    }
}
