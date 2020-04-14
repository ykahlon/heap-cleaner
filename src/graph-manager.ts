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
    this.jsonHeapDump.node_count = this.nodeMap.size;
    this.jsonHeapDump.edge_count = this.jsonHeapDump.edges.length / 3;
    return JSON.stringify(this.jsonHeapDump);
  }

  focusOnNode(nodeId: number, trueRootId: number) {
    const [nodeToFocus, rootNode] = [this.findNodeByNodeId(nodeId), this.findNodeByNodeId(trueRootId)];

    // When removing the first layer of next nodes. For each next node, recursively compare the set of retailres
    // to the set of retainers of the focused node, if no common retainer found, remove edge between the current and the next.

    // Cleanup some of the data structure by removing non-retainer nodes.
    this.deleteNonRetainerNodes(nodeToFocus, rootNode);

    // disconnect the next layer of nodes and then remove all the nodes that
    // are not children of the root node.
    nodeToFocus.disconnectNextNodes();
    const allRootChildren = this.getAllChildren(rootNode);
    allRootChildren.add(rootNode);
    if (!allRootChildren.has(nodeToFocus)) {
      throw new Error('Node to focus needs to be a child of the root node after the non retainer deletion.');
    }
    this.deleteOtherNodes(allRootChildren);

    // cleanup the graph
    this.deleteNonRetainerNodes(nodeToFocus, rootNode);
    this.removeAllIsolatedNodes();
  }

  private deleteNonRetainerNodes(nodeToFocus: HeapNode, rootNode: HeapNode) {
    const retainerNodes = this.collectRetainers(nodeToFocus);
    if (!retainerNodes.has(rootNode)) {
      throw new Error('Root node is not a retainer of the node to focus');
    }
    retainerNodes.add(nodeToFocus);
    this.deleteOtherNodes(retainerNodes);
  }

  private deleteOtherNodes(retainerNodes: Set<HeapNode>) {
    // Delete prev nodes not relevant to the node we focus on
    for (const [index, node] of [...this.nodeMap.entries()]) {
      if (!retainerNodes.has(node)) {
        const nextNodes = node.getNextNodes();
        const prevNodes = node.getPrevNodes();
        node.disconnectNextNodes();
        node.disconnectPrevNodes();
        this.nodeMap.delete(index);
      }
    }
  }

  private collectRetainers(nodeToFocus: HeapNode): Set<HeapNode> {
    const retainerNodes = new Set<HeapNode>([...nodeToFocus.getPrevNodes()]);
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
    return retainerNodes;
  }

  private findNodeByNodeId(nodeId: number) {
    const node = [...this.nodeMap.values()].find((node) => node.getNodeId() === nodeId);
    if (!node) {
      throw new Error('Cannot find node with id: ' + nodeId);
    }
    return node;
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

  private removeAllIsolatedNodes() {
    for (const [location, node] of [...this.nodeMap.entries()]) {
      if (!node.getNextNodes().length && !node.getPrevNodes().length) {
        this.nodeMap.delete(location);
      }
    }
  }

  private getAllChildren(rootNode: HeapNode): Set<HeapNode> {
    const stack: HeapNode[] = [];
    stack.push(...rootNode.getNextNodes());
    const children = new Set<HeapNode>();
    while (stack.length) {
      const tempStack = new Set<HeapNode>();
      for (const current of stack) {
        if (!children.has(current)) {
          children.add(current);
        }
        for (const next of current.getNextNodes()) {
          if (!children.has(next)) {
            tempStack.add(next);
          }
        }
      }
      stack.splice(0);
      stack.push(...tempStack.values());
    }
    return children;
  }
}
