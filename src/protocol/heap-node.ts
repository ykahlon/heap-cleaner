import { GraphManager } from '../graph-manager'
import { HeapEdge } from './heap-edge'

/** A representation of a single node in the graph. */
export class HeapNode {
  private readonly prevNodes = new Set<HeapNode>()
  private readonly nextNodes = new Map<HeapNode, Set<HeapEdge>>()

  constructor(
    private readonly graphManager: GraphManager,
    public readonly originalNodeFields: number[],
    public readonly originalIndex: number,
    public readonly indexInNodeMap: number
  ) {}

  connectPrevNode(node: HeapNode) {
    if (node === this) {
      return
    }
    this.prevNodes.add(node)
  }

  connectNextNode(node: HeapNode, edge: HeapEdge) {
    if (node === this) {
      return
    }
    let set = this.nextNodes.get(node)
    if (!set) {
      set = new Set<HeapEdge>()
      this.nextNodes.set(node, set)
    }
    set.add(edge)
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
      for (const edge of edges) {
        result.push({ node, edge })
      }
    }
    return result
  }

  getOriginalEdgeCount(): number {
    return this.originalNodeFields[this.graphManager.nodeEdgeCountOffset]
  }

  getNodeId() {
    return this.originalNodeFields[this.graphManager.nodeIdOffset]
  }

  getNodeNameIndex() {
    return this.originalNodeFields[this.graphManager.nodeNameOffset]
  }

  disconnectNextNodes() {
    for (const nextNode of this.nextNodes.keys()) {
      nextNode.removePrevNode(this)
    }
    this.nextNodes.clear()
  }

  removeEdge(node: HeapNode, edge: HeapEdge) {
    const edges = this.nextNodes.get(node)
    if (edges) {
      edges.delete(edge)
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
  edge: HeapEdge
  node: HeapNode
}
