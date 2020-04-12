// "node_fields":["type","name","id","self_size","edge_count","trace_node_id"
export class HeapNode {
    private prevNodes = new Set<HeapNode>();
    private nextNodes = new Map<HeapNode, Edge>();

    constructor(public readonly originalNodeFields: number[],
                public readonly originalIndex: number) {
    }

    connectPrevNode(prevNode: HeapNode) {
        this.prevNodes.add(prevNode);
    }

    connectNextNode(nextNode: HeapNode, edge: Edge) {
        this.nextNodes.set(nextNode, edge);
    }

    delete() {
        for (const prevNode of this.prevNodes) {
            prevNode.removeNextNode(this);
            for (const [nextNode, edge] of this.nextNodes.entries()) {
                nextNode.removePrevNode(this);
                prevNode.connectNextNode(nextNode, edge);
                nextNode.connectPrevNode(prevNode);
            }
        }
    }

    private removeNextNode(node: HeapNode) {
        this.nextNodes.delete(node);
    }

    private removePrevNode(node: HeapNode) {
        this.prevNodes.delete(node);
    }

    getEdgeCount() {
        return this.nextNodes.size;
    }

    getNextEdges(): Map<HeapNode, Edge> {
        return new Map(this.nextNodes.entries());
    }
}

// "edge_fields":["type","name_or_index","to_node"]
export interface Edge {
    type: number;
}
