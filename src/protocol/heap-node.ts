// "node_fields":["type","name","id","self_size","edge_count","trace_node_id"
export class HeapNode {
    private prevNodes: HeapNode[] = [];
    private nextNodes: Array<{ node: HeapNode, edge: Edge }> = [];

    constructor(public readonly originalNodeFields: number[],
                public readonly originalIndex: number) {
    }

    connectPrevNode(prevNode: HeapNode) {
        this.prevNodes.push(prevNode);
    }

    connectNextNode(node: HeapNode, edge: Edge) {
        this.nextNodes.push({node, edge});
    }

    delete() {
        for (const prevNode of this.prevNodes) {
            prevNode.removeNextNode(this);
            for (const {node: nextNode, edge} of this.nextNodes) {
                nextNode.removePrevNode(this);
                prevNode.connectNextNode(nextNode, edge);
                nextNode.connectPrevNode(prevNode);
            }
        }
    }

    private removeNextNode(node: HeapNode) {
        const indexToDelete = this.nextNodes.findIndex((item) => item.node === node);
        if (indexToDelete > -1) {
            this.nextNodes.splice(indexToDelete, 1);
        }
    }

    private removePrevNode(node: HeapNode) {
        const indexToDelete = this.prevNodes.findIndex((item) => item === node);
        if (indexToDelete > -1) {
            this.prevNodes.splice(indexToDelete, 1);
        }
    }

    getEdgeCount() {
        return this.nextNodes.length;
    }

    getNextEdges(): { node: HeapNode; edge: Edge }[] {
        return [...this.nextNodes];
    }

    getOriginalEdgeCount(): number {
        return this.originalNodeFields[4];
    }
}

// "edge_fields":["type","name_or_index","to_node"]
export interface Edge {
    type: number;
    nameOrIndexToStrings: number | string;
}
