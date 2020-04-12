import {JsonHeapDump} from "./protocol/json-heap-dump";
import {Edge, HeapNode} from "./protocol/heap-node";

// TODO: consider parsing node/edge types (hardcoded right now)
// TODO: check if need to modify functions, trace, samples etc
// TODO: check what's the meaning of 'name_or_index' in edge
export class GraphManager {
    constructor(private readonly jsonHeapDump: JsonHeapDump) {
    }

    constructGraph(): Set<HeapNode> {
        const resultMap = new Map<number, HeapNode>();
        for (let i = 0; i < this.jsonHeapDump.nodes.length; i += 6) {
            let heapNode = new HeapNode(this.jsonHeapDump.nodes.slice(i, i + 6), i);
            resultMap.set(i, heapNode);
        }

        for (let i = 0; i < this.jsonHeapDump.edges.length; i += 3) {
            let [type, fromNodeIndex, toNodeIndex] = this.jsonHeapDump.edges.slice(i, i + 3);
            let edge: Edge = {type};
            resultMap.get(fromNodeIndex)?.connectNextNode(resultMap.get(toNodeIndex)!, edge);
            resultMap.get(toNodeIndex)?.connectPrevNode(resultMap.get(fromNodeIndex)!);
        }

        return new Set(resultMap.values());
    }

    exportGraphToJson(nodeSet: Set<HeapNode>): string {
        const sortedNodes = [...nodeSet.values()]
            .sort((a, b) => a.originalIndex - b.originalIndex);

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
                this.jsonHeapDump.edges.push(edge.type, nodeIndices.get(heapNode)!, nodeIndices.get(nextNode)!);
            }
        }

        return JSON.stringify(this.jsonHeapDump);
    }
}
