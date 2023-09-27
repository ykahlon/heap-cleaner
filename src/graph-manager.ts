import { JsonHeapDump } from './protocol/json-heap-dump'
import { HeapNode } from './protocol/heap-node'
import { JSHeapSnapshot, DOMLinkState } from './vendor/HeapSnapshot'
import { log } from './log'

// TODO: consider parsing node/edge types (hardcoded right now)
// TODO: check if need to modify functions, trace, samples etc
// TODO: check what's the meaning of 'name_or_index' in edge
export class GraphManager {
  private jsonHeapDump: JsonHeapDump
  private nodeMap: Record<number, HeapNode> = {} // https://stackoverflow.com/a/54466812
  public readonly nodeFieldCount: number
  public readonly edgeFieldCount: number
  public readonly nodeNameOffset: number
  public readonly nodeIdOffset: number
  public readonly nodeEdgeCountOffset: number
  public readonly edgeTypeOffset: number
  public readonly edgeNameOffset: number
  public readonly edgeToNodeOffset: number
  private readonly edgeWeakType: number
  private readonly nodeDetachednessOffset: number
  public readonly nodes: Uint32Array
  private readonly edges: Uint32Array

  constructor(snapshot: JSHeapSnapshot) {
    this.nodeFieldCount = snapshot.nodeFieldCount
    this.edgeFieldCount = snapshot.edgeFieldsCount
    this.nodeNameOffset = snapshot.nodeNameOffset
    this.nodeIdOffset = snapshot.nodeIdOffset
    this.nodeEdgeCountOffset = snapshot.nodeEdgeCountOffset
    this.edgeTypeOffset = snapshot.edgeTypeOffset
    this.edgeNameOffset = snapshot.edgeNameOffset
    this.edgeToNodeOffset = snapshot.edgeToNodeOffset
    this.edgeWeakType = snapshot.edgeWeakType
    this.nodeDetachednessOffset = snapshot.nodeDetachednessOffset
    this.nodes = snapshot.nodes
    this.edges = snapshot.containmentEdges

    this.jsonHeapDump = {
      snapshot: { ...snapshot.profile.snapshot },
      nodes: [],
      edges: [],
      samples: [],
      locations: [],
      strings: [...snapshot.profile.strings],
    }
    this.constructGraph(snapshot)
  }

  /** Constructs the heap snapshot graph from the json object. */
  private constructGraph(snapshot: JSHeapSnapshot) {
    log('Building graph - start!')
    log('reading nodes - start!')
    for (let i = 0; i < snapshot.nodes.length; i += this.nodeFieldCount) {
      this.nodeMap[i] = new HeapNode(this, i)
    }
    log('reading nodes - end. Read: ' + snapshot.nodes.length / this.nodeFieldCount + ' nodes.')
    log('reading edges - start!')
    let currentEdgeIndex = 0
    for (const node of Object.values(this.nodeMap)) {
      const limit = currentEdgeIndex + node.getOriginalEdgeCount() * this.edgeFieldCount
      for (let i = currentEdgeIndex; i < limit; i += this.edgeFieldCount) {
        const toNode = this.nodeMap[snapshot.containmentEdges[i + this.edgeToNodeOffset]]!
        node.connectNextNode(toNode, i)
        toNode.connectPrevNode(node)
      }
      currentEdgeIndex += node.getOriginalEdgeCount() * this.edgeFieldCount
    }
    log('reading edges - end. Read: ' + currentEdgeIndex / this.edgeFieldCount + ' edges.')
    log('Building graph - end!')
  }

  /** Exports the graph back to a json representation. */
  public exportGraphToJson(): JsonHeapDump {
    const sortedNodes = Object.values(this.nodeMap)
    this.jsonHeapDump.nodes = []
    this.jsonHeapDump.edges = []
    const allStrings: string[] = []
    const stringsWithIndex: Map<string, number> = new Map()

    const nodeIndices: Record<number, number> = {}
    for (const heapNode of sortedNodes) {
      const nodeName = this.jsonHeapDump.strings[heapNode.getNodeNameIndex()]
      if (!stringsWithIndex.has(nodeName)) {
        allStrings.push(nodeName)
        stringsWithIndex.set(nodeName, allStrings.length - 1)
      }
      const nodeFields = Array.from(this.nodes.slice(heapNode.nodeIndex, heapNode.nodeIndex + this.nodeFieldCount))
      nodeFields[this.nodeNameOffset] = stringsWithIndex.get(nodeName)!
      nodeFields[this.nodeEdgeCountOffset] = heapNode.getEdgeCount()
      nodeFields[this.nodeDetachednessOffset] = DOMLinkState.Unknown
      nodeIndices[heapNode.nodeIndex] = this.jsonHeapDump.nodes.length
      this.jsonHeapDump.nodes.push(...nodeFields)
    }
    for (const heapNode of sortedNodes) {
      for (const { node, edgeIndex } of heapNode.getNextNodesAndEdges()) {
        const edgeNameIndex = this.edges[edgeIndex + this.edgeNameOffset]
        const edgeName = this.jsonHeapDump.strings[edgeNameIndex]
        if (!stringsWithIndex.has(edgeName)) {
          allStrings.push(edgeName)
          stringsWithIndex.set(edgeName, allStrings.length - 1)
        }
        const edgeFields = Array.from(this.edges.slice(edgeIndex, edgeIndex + this.edgeFieldCount))
        edgeFields[this.edgeNameOffset] = stringsWithIndex.get(edgeName)!
        edgeFields[this.edgeToNodeOffset] = nodeIndices[node.nodeIndex]!
        this.jsonHeapDump.edges.push(...edgeFields)
      }
    }

    // TODO: Currently chrome ignores the line numbers when loading a snapshot file, uncomment and test once supported.
    // const origLocation = this.jsonHeapDump.locations;
    // this.jsonHeapDump.locations = [];
    // for (let i = 0; i < origLocation.length; i += 4) {
    //   const location = origLocation.slice(i, i + 4);
    //   const origNodeIndex = location[0];
    //   const node = this.nodeMap.get(origNodeIndex);
    //   if (!node) {
    //     continue;
    //   }
    //   location[0] = nodeIndices.get(node);
    //   this.jsonHeapDump.locations.push(...location);
    // }
    this.jsonHeapDump.strings = allStrings
    this.jsonHeapDump.snapshot.node_count = Object.keys(this.nodeMap).length
    this.jsonHeapDump.snapshot.edge_count = this.jsonHeapDump.edges.length / this.edgeFieldCount
    log(
      `exporting graph. Total nodes: ${this.jsonHeapDump.snapshot.node_count}, total edges: ${this.jsonHeapDump.snapshot.edge_count}`
    )
    return this.jsonHeapDump
  }

  /** Reduces the graph to focus on retainers for a specific node. */
  public focusOnNode(nodeId: number, trueRootId: number) {
    log(`Focus on node ${nodeId} - start!`)
    log('Finding nodes...')
    const [nodeToFocus, rootNode] = [this.findNodeByNodeId(nodeId), this.findNodeByNodeId(trueRootId)]
    log('Disconnecting the root from the previous nodes...')
    rootNode.disconnectPrevNodes()

    log('Removing feedback cells...')
    this.disconnectEdgesWithName('feedback_cell')

    log('Removing weak links...')
    this.disconnectEdgesWithType(this.edgeWeakType)
    // this.disconnectEdgesMatchName(/part of key .* -> value .* pair in WeakMap/)
    this.disconnectNodesWithName('WeakMap', 'WeakSet', 'WeakRef', 'system / StackTraceFrame')

    // log('Removing constructors')
    // this.disconnectEdgesWithName('__proto__', 'constructor', 'prototype')

    log('Removing all nodes that are not retainers of node to focus...')
    // Cleanup some of the data structure by removing non-retainer nodes.
    this.deleteNonRetainerNodes(nodeToFocus, rootNode)

    log('Disconnecting the node to focus from its next nodes...')
    // disconnect the next layer of nodes and then remove all the nodes that
    // are not children of the root node.
    nodeToFocus.disconnectNextNodes()

    log('Removing all nodes that are not referenced by the root node...')
    const allRootChildren = this.getAllChildren(rootNode)
    allRootChildren[rootNode.nodeIndex] = rootNode
    if (!allRootChildren[nodeToFocus.nodeIndex]) {
      throw new Error('Node to focus needs to be a child of the root node after the non retainer deletion.')
    }
    this.deleteOtherNodes(allRootChildren)
    this.deleteNonRetainerNodes(nodeToFocus, rootNode)

    this.removeCycles(rootNode, nodeToFocus)

    log('Cleanup...')
    // cleanup the graph
    this.deleteNonRetainerNodes(nodeToFocus, rootNode)
    this.removeAllIsolatedNodes()
    log('Focus on node - end!')
  }

  private deleteNonRetainerNodes(nodeToFocus: HeapNode, rootNode: HeapNode) {
    const retainerNodes = this.collectRetainers(nodeToFocus)
    if (!retainerNodes[rootNode.nodeIndex]) {
      throw new Error('Root node is not a retainer of the node to focus')
    }
    this.deleteOtherNodes(retainerNodes)
  }

  private deleteOtherNodes(retainerNodes: Record<number, HeapNode>) {
    // Delete prev nodes not relevant to the node we focus on
    for (const [indexInNodeMap, node] of Object.entries(this.nodeMap)) {
      if (!retainerNodes[node.nodeIndex]) {
        this.deleteNode(Number(indexInNodeMap))
      }
    }
  }

  private deleteNode(indexInNodeMap: number) {
    const node = this.nodeMap[indexInNodeMap]
    if (!node) {
      throw new Error('Cannot find node to delete. Index: ' + indexInNodeMap)
    }
    node.disconnectNextNodes()
    node.disconnectPrevNodes()
    delete this.nodeMap[indexInNodeMap]
  }

  private collectRetainers(nodeToFocus: HeapNode): Record<number, HeapNode> {
    const retainerNodes: Record<number, HeapNode> = {}
    let queue = [nodeToFocus]
    while (queue.length > 0) {
      const prevNode = queue.pop()!
      if (!retainerNodes[prevNode.nodeIndex]) {
        retainerNodes[prevNode.nodeIndex] = prevNode
        const prevNodes = prevNode.getPrevNodes()
        while (prevNodes.length > 0) {
          const chunk = prevNodes.splice(0, 1000)
          queue.push(...chunk)
        }
      }
    }

    return retainerNodes
  }

  private findNodeByNodeId(nodeId: number) {
    const node = Object.values(this.nodeMap).find((node) => node.getNodeId() === nodeId)
    if (!node) {
      throw new Error('Cannot find node with id: ' + nodeId)
    }
    return node
  }

  private removeAllIsolatedNodes() {
    for (const [indexInNodeMap, node] of Object.entries(this.nodeMap)) {
      if (!node.getNextNodes().length && !node.getPrevNodes().length) {
        delete this.nodeMap[Number(indexInNodeMap)]
      }
    }
  }

  private getAllChildren(rootNode: HeapNode): Record<number, HeapNode> {
    const stack: HeapNode[] = []
    stack.push(...rootNode.getNextNodes())
    const children: Record<number, HeapNode> = {}
    while (stack.length) {
      const tempStack: Record<number, HeapNode> = {}
      for (const current of stack) {
        if (!children[current.nodeIndex]) {
          children[current.nodeIndex] = current
        }
        for (const next of current.getNextNodes()) {
          if (!children[next.nodeIndex]) {
            tempStack[next.nodeIndex] = next
          }
        }
      }
      stack.splice(0)
      const nodes = Object.values(tempStack)
      while (nodes.length > 0) {
        const chunk = nodes.splice(0, 1000)
        stack.push(...chunk)
      }
    }
    return children
  }

  private removeCycles(rootNode: HeapNode, nodeToFocus: HeapNode) {
    log('removing cycles in the graph....')
    const visited: Record<number, true> = {}
    visited[rootNode.nodeIndex] = true

    let nexts = rootNode.getNextNodes()
    let layer = 0
    while (nexts.length) {
      log(`removing cycles - layer: ${layer}. Layer size: ${nexts.length}.`)
      const nextLayer: Record<number, HeapNode> = {}
      for (const next of nexts) {
        if (!visited[next.nodeIndex]) {
          for (const prevNode of next.getPrevNodes().filter((prev) => !visited[prev.nodeIndex])) {
            next.disconnectPrevNode(prevNode)
          }
        }
        next
          .getNextNodes()
          .filter((n) => !visited[n.nodeIndex])
          .forEach((n) => {
            nextLayer[n.nodeIndex] = n
          })
      }
      for (const visitedNode of nexts) {
        visited[visitedNode.nodeIndex] = true
      }
      nexts = Object.values(nextLayer)
      layer++
      this.deleteNonRetainerNodes(nodeToFocus, rootNode)
    }
  }

  private disconnectEdgesWithName(...edgeNamesToDisconnect: string[]) {
    const indexes: Record<number, true> = {}
    for (const idx in this.jsonHeapDump.strings) {
      if (edgeNamesToDisconnect.some((edgeNameToDelete) => edgeNameToDelete === this.jsonHeapDump.strings[idx])) {
        indexes[idx] = true
      }
    }
    for (const node of Object.values(this.nodeMap)) {
      for (const nextEdgeAndNode of node.getNextNodesAndEdges()) {
        const edgeNameIndex = nextEdgeAndNode.edgeIndex + this.edgeNameOffset
        if (indexes[edgeNameIndex]) {
          node.removeEdge(nextEdgeAndNode.node, nextEdgeAndNode.edgeIndex)
        }
      }
    }
  }

  // @ts-ignore
  private disconnectEdgesMatchName(...edgeNamesToDisconnect: RegExp[]) {
    const indexes: Record<number, true> = {}
    for (const idx in this.jsonHeapDump.strings) {
      if (edgeNamesToDisconnect.some((edgeNameToDelete) => edgeNameToDelete.test(this.jsonHeapDump.strings[idx]))) {
        indexes[idx] = true
      }
    }
    for (const node of Object.values(this.nodeMap)) {
      for (const nextEdgeAndNode of node.getNextNodesAndEdges()) {
        const edgeNameIndex = nextEdgeAndNode.edgeIndex + this.edgeNameOffset
        if (indexes[edgeNameIndex]) {
          node.removeEdge(nextEdgeAndNode.node, nextEdgeAndNode.edgeIndex)
        }
      }
    }
  }

  private disconnectEdgesWithType(...edgeTypesToDisconnect: number[]) {
    for (const node of Object.values(this.nodeMap)) {
      for (const nextEdgeAndNode of node.getNextNodesAndEdges()) {
        const edgeType = this.edges[nextEdgeAndNode.edgeIndex + this.edgeTypeOffset]
        if (edgeTypesToDisconnect.includes(edgeType)) {
          node.removeEdge(nextEdgeAndNode.node, nextEdgeAndNode.edgeIndex)
        }
      }
    }
  }

  private disconnectNodesWithName(...nodeNamesToDisconnect: string[]) {
    for (const nodeNameToDelete of nodeNamesToDisconnect) {
      for (const node of Object.values(this.nodeMap)) {
        if (this.jsonHeapDump.strings[node.getNodeNameIndex()] === nodeNameToDelete) {
          node.disconnectNextNodes()
          node.disconnectPrevNodes()
        }
      }
    }
  }

  public findNodeByName(name: string): HeapNode {
    for (const node of Object.values(this.nodeMap)) {
      const nodeName = this.jsonHeapDump.strings[node.getNodeNameIndex()]
      if (nodeName === name) {
        return node
      }
    }
    throw new Error('Cannot find node with name: ' + name)
  }

  // @ts-ignore
  private deleteAllDetachedNodes(nodeToExclude: HeapNode) {
    log('Removing all nodes with name starts with Detached (except the node to focus)...')
    for (const [indexInNodeMap, node] of Object.entries(this.nodeMap)) {
      if (node === nodeToExclude) {
        continue
      }
      if (this.jsonHeapDump.strings[node.getNodeNameIndex()].startsWith('Detached ')) {
        this.deleteNode(Number(indexInNodeMap))
      }
    }
  }
}
