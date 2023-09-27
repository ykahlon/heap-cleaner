import { GraphManager } from '../graph-manager'

/** A representation of a single node in the graph. */
export class HeapNode {
  private readonly prevNodes = new Set<HeapNode>()
  private readonly nextNodes = new Map<HeapNode, Set<number>>()

  constructor(
    private readonly graphManager: GraphManager,
    public readonly nodeIndex: number
  ) {}

  connectPrevNode(node: HeapNode) {
    if (node === this) {
      return
    }
    this.prevNodes.add(node)
  }

  connectNextNode(node: HeapNode, edgeIndex: number) {
    if (node === this) {
      return
    }
    let set = this.nextNodes.get(node)
    if (!set) {
      set = new Set<number>()
      this.nextNodes.set(node, set)
    }
    set.add(edgeIndex)
  }

  private removePrevNode(node: HeapNode) {
    this.prevNodes.delete(node)
  }

  getEdgeCount() {
    let counter = 0
    for (const edges of this.nextNodes.values()) {
      counter += edges.size
    }
    return counter
  }

  getNextNodesAndEdges(): EdgeAndNode[] {
    const result: EdgeAndNode[] = []
    for (const [node, edges] of this.nextNodes.entries()) {
      for (const edgeIndex of edges) {
        result.push({ node, edgeIndex })
      }
    }
    return result
  }

  getOriginalEdgeCount(): number {
    return this.graphManager.nodes[this.nodeIndex + this.graphManager.nodeEdgeCountOffset]
  }

  getNodeId() {
    return this.graphManager.nodes[this.nodeIndex + this.graphManager.nodeIdOffset]
  }

  getNodeNameIndex() {
    return this.graphManager.nodes[this.nodeIndex + this.graphManager.nodeNameOffset]
  }

  disconnectNextNodes() {
    for (const nextNode of this.nextNodes.keys()) {
      nextNode.removePrevNode(this)
    }
    this.nextNodes.clear()
  }

  removeEdge(node: HeapNode, edgeIndex: number) {
    const edges = this.nextNodes.get(node)
    if (edges) {
      edges.delete(edgeIndex)
      if (!edges.size) {
        this.nextNodes.delete(node)
        node.removePrevNode(this)
      }
    }
  }

  getPrevNodes(): HeapNode[] {
    return [...this.prevNodes]
  }

  getNextNodes(): HeapNode[] {
    return [...this.nextNodes.keys()]
  }

  disconnectPrevNodes() {
    for (const prevNode of this.getPrevNodes()) {
      prevNode.nextNodes.delete(this)
    }
    this.prevNodes.clear()
  }

  disconnectPrevNode(node: HeapNode) {
    node.nextNodes.delete(this)
    this.prevNodes.delete(node)
  }
}

export interface EdgeAndNode {
  edgeIndex: number
  node: HeapNode
}
