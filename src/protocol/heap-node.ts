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

    removePrevNode(node: HeapNode) {
        let indexToDelete: number;
        while ((indexToDelete = this.prevNodes.findIndex((item) => item === node)) !== -1) {
            this.prevNodes.splice(indexToDelete, 1);
        }
    }

    removeSinglePrevNode(node: HeapNode) {
        const indexToDelete = this.prevNodes.findIndex((item) => item === node);
        if (indexToDelete !== -1) {
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

    getNodeId() {
        return this.originalNodeFields[2];
    }

    removeNextNodes() {
        for (const nextNode of [...this.nextNodes]) {
            nextNode.node.removePrevNode(this);
        }
        this.nextNodes.splice(0);
    }

    removeNextNode(node: HeapNode, edge: Edge) {
        const indexToDelete = this.nextNodes
            .findIndex((nextNode) => nextNode.node === node && nextNode.edge === edge);
        if (indexToDelete === -1) return;
        this.nextNodes[indexToDelete].node.removeSinglePrevNode(this);
        this.nextNodes.splice(indexToDelete, 1);
    }

    getPrevNodes(): HeapNode[] {
        return [...this.prevNodes];
    }
}

// "edge_fields":["type","name_or_index","to_node"]
export interface Edge {
    type: number;
    nameOrIndexToStrings: number | string;
}
