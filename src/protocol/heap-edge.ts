import { GraphManager } from '../graph-manager'

/** A representation of a single edge in the graph. */
export class HeapEdge {
  constructor(
    private readonly graphManager: GraphManager,
    public readonly originalEdgeFields: number[]
  ) {}

  getEdgeType(): number {
    return this.originalEdgeFields[this.graphManager.edgeTypeOffset]
  }

  getEdgeNameIndex(): number {
    return this.originalEdgeFields[this.graphManager.edgeNameOffset]
  }

  getOriginalToNode(): number {
    return this.originalEdgeFields[this.graphManager.edgeToNodeOffset]
  }
}
