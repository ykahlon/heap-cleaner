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
            currentEdgeIndex += node.getOriginalEdgeCount() * 3;
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
            for (const {node, edge} of heapNode.getNextEdges()) {
                // TODO: casting to number even though it may be a string
                this.jsonHeapDump.edges.push(edge.type, edge.nameOrIndexToStrings as number, nodeIndices.get(node)!);
            }
        }

        return JSON.stringify(this.jsonHeapDump);
    }

    focusOnNode(nodeId: number) {
        const nodeToFocus = [...this.nodeMap.values()].find((node) => node.getNodeId() === nodeId);
        if (!nodeToFocus) {
            throw new Error('Cannot focus on node with id: ' + nodeId);
        }

        // When removing the first layer of next nodes. For each next node, recursively compare the set of retailres
        // to the set of retainers of the focused node, if no common retainer found, remove edge between the current and the next.
        nodeToFocus.removeNextNodes();
        const retainerNodes = new Set<HeapNode>();

        // Remove relevant nodes from the immediate family of this node
        for (const retainerNode of nodeToFocus.getPrevNodes()) {
            const retainerEdges = retainerNode.getNextEdges()
                .filter((next) => next.node === nodeToFocus)
                .map((next) => next.edge);
            let deleteCount = 0;
            for (let i = 0; i < retainerEdges.length; i++) {
                let edge = retainerEdges[i];
                // Weak reference
                if (edge.type === 6) {
                    retainerNode.removeNextNode(nodeToFocus, edge);
                    deleteCount++;
                }
            }
            if (deleteCount < retainerEdges.length) {
                retainerNodes.add(retainerNode);
            }
        }

        retainerNodes.add(nodeToFocus);
        // Recursively collect all prev retainer nodes
        for (const retainerNode of retainerNodes) {
            this.visitRecursivePrevs(retainerNode, (node) => {
                if (retainerNodes.has(node)) {
                    return false;
                }
                retainerNodes.add(node);
                return true;
            });
        }

        // Delete prev nodes not relevant to the node we focus on
        for (const [index, node] of [...this.nodeMap.entries()]) {
            if (!retainerNodes.has(node)) {
                this.nodeMap.delete(index);
            }
        }
    }

    private getSortedNodes(): HeapNode[] {
        return [...this.nodeMap.values()]
            .sort((a, b) => a.originalIndex - b.originalIndex);
    }

    private visitRecursivePrevs(node: HeapNode, visitor: (node) => (boolean)) {
        for (const prevNode of node.getPrevNodes()) {
            if (visitor(prevNode)) {
                this.visitRecursivePrevs(prevNode, visitor);
            }
        }
    }
}
