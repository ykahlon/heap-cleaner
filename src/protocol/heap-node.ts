// "node_fields":["type","name","id","self_size","edge_count","trace_node_id"


/** A representation of a single node in the graph. */
export class HeapNode {
    private readonly prevNodes = new Set<HeapNode>();
    private readonly nextNodes = new Map<HeapNode, Set<Edge>>();

    constructor(public readonly originalNodeFields: number[],
                public readonly originalIndex: number) {
    }

    connectPrevNode(node: HeapNode) {
        if (node === this) {
            return;
        }
        this.prevNodes.add(node);
    }

    connectNextNode(node: HeapNode, edge: Edge) {
        if (node === this) {
            return;
        }
        let set = this.nextNodes.get(node);
        if (!set) {
            set = new Set<Edge>();
            this.nextNodes.set(node, set);
        }
        set.add(edge);
    }

    private removePrevNode(node: HeapNode) {
        this.prevNodes.delete(node);
    }

    getEdgeCount() {
        let counter = 0;
        for (const edges of this.nextNodes.values()) {
            counter += edges.size;
        }
        return counter;
    }

  getNextNodesAndEdges(): EdgeAndNode[] {
        const result: EdgeAndNode[] = [];
        for (const [node, edges] of this.nextNodes.entries()) {
            for (const edge of edges) {
                result.push({node, edge});
            }
        }
        return result;
    }

    getOriginalEdgeCount(): number {
        return this.originalNodeFields[4];
    }

    getNodeId() {
        return this.originalNodeFields[2];
    }

    getNodeNameIndex() {
        return this.originalNodeFields[1];
    }

    disconnectNextNodes() {
      for (const nextNode of this.nextNodes.keys()) {
            nextNode.removePrevNode(this);
        }
        this.nextNodes.clear();
    }

  removeEdge(node: HeapNode, edge: Edge) {
        const edges = this.nextNodes.get(node);
        if (edges) {
            edges.delete(edge);
            if (!edges.size) {
                this.nextNodes.delete(node);
                node.removePrevNode(this);
            }
        }
    }

    getPrevNodes(): HeapNode[] {
        return [...this.prevNodes];
    }

    getNextNodes(): HeapNode[] {
        return [...this.nextNodes.keys()];
    }

    disconnectPrevNodes() {
        for (const prevNode of this.getPrevNodes()) {
          prevNode.nextNodes.delete(this);
        }
        this.prevNodes.clear();
    }

    disconnectPrevNode(node: HeapNode) {
        node.nextNodes.delete(this);
        this.prevNodes.delete(node);
    }
}

// "edge_fields":["type","name_or_index","to_node"]
export interface Edge {
    type: number;
    nameOrIndexToStrings: number | string;
}

export interface EdgeAndNode {
    edge: Edge;
    node: HeapNode;
}
