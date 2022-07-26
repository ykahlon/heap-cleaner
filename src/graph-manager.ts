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

  /** Constructs the heap snapshot graph from the json object. */
  constructGraph() {
    console.log('Building graph - start!');
    console.log('reading nodes - start!');
    for (let i = 0; i < this.jsonHeapDump.nodes.length; i += 6) {
      let heapNode = new HeapNode(this.jsonHeapDump.nodes.slice(i, i + 6), i);
      this.nodeMap.set(i, heapNode);
    }
    console.log('reading nodes - end. Read: ' + this.nodeMap.size + ' nodes.');
    console.log('reading edges - start!');
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
    console.log('reading edges - end. Read: ' + (currentEdgeIndex / 3) + ' edges.');
    console.log('Building graph - end!')
  }

  /** Exports the graph back to a json representation. */
  exportGraphToJson(): string {
    const sortedNodes = this.getSortedNodes();
    this.jsonHeapDump.nodes = [];
    this.jsonHeapDump.edges = [];
    const allStrings: string[] = [];
    const stringsWithIndex = new Map<string, number>();

    const nodeIndices = new Map<HeapNode, number>();
    for (const heapNode of sortedNodes) {
      const nodeName = this.jsonHeapDump.strings[heapNode.getNodeNameIndex()];
      if (!stringsWithIndex.has(nodeName)) {
        allStrings.push(nodeName);
        stringsWithIndex.set(nodeName, allStrings.length - 1);
      }
      heapNode.originalNodeFields[1] = stringsWithIndex.get(nodeName)!;
      heapNode.originalNodeFields[4] = heapNode.getEdgeCount();
      nodeIndices.set(heapNode, this.jsonHeapDump.nodes.length);
      this.jsonHeapDump.nodes.push(...heapNode.originalNodeFields);
    }
    for (const heapNode of sortedNodes) {
      for (const {node, edge} of heapNode.getNextNodesAndEdges()) {
        if (typeof edge.nameOrIndexToStrings === 'number') {
          const edgeName = this.jsonHeapDump.strings[edge.nameOrIndexToStrings as number];
          if (!stringsWithIndex.has(edgeName)) {
            allStrings.push(edgeName);
            stringsWithIndex.set(edgeName, allStrings.length - 1);
          }
          edge.nameOrIndexToStrings = stringsWithIndex.get(edgeName)!;
        }


        // TODO: casting to number even though it may be a string
        this.jsonHeapDump.edges.push(edge.type, edge.nameOrIndexToStrings as number, nodeIndices.get(node)!);
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
    this.jsonHeapDump.strings = allStrings;
    this.jsonHeapDump.snapshot.node_count = this.nodeMap.size;
    this.jsonHeapDump.snapshot.edge_count = this.jsonHeapDump.edges.length / 3;
    console.log(`exporting graph. Total nodes: ${this.jsonHeapDump.snapshot.node_count}, total edges: ${this.jsonHeapDump.snapshot.edge_count}`);
    return JSON.stringify(this.jsonHeapDump);
  }

  /** Reduces the graph to focus on retainers for a specific node. */
  focusOnNode(nodeId: number, trueRootId: number) {
    console.log('Focus on node - start!');
    console.log('Finding nodes...');
    const [nodeToFocus, rootNode] = [this.findNodeByNodeId(nodeId), this.findNodeByNodeId(trueRootId)];
    console.log('Disconnecting the root from the previous nodes...');
    rootNode.disconnectPrevNodes();

    // Optimization (need to verify if correct) - feedback cells can be ignored when exploring memory leaks.
    console.log('Removing feedback cells...');
    this.disconnectEdgesWithName('feedback_cell');

//    console.log('Removing weak links...');
    this.disconnectEdgesWithType('weak');

    console.log('Removing all nodes that are not retainers of node to focus...');
    // Cleanup some of the data structure by removing non-retainer nodes.
    this.deleteNonRetainerNodes(nodeToFocus, rootNode);

    console.log('Disconnecting the node to focus from its next nodes...');
    // disconnect the next layer of nodes and then remove all the nodes that
    // are not children of the root node.
    nodeToFocus.disconnectNextNodes();

    console.log('Removing all nodes that are not referenced by the root node...');
    const allRootChildren = this.getAllChildren(rootNode);
    allRootChildren.add(rootNode);
    if (!allRootChildren.has(nodeToFocus)) {
      throw new Error('Node to focus needs to be a child of the root node after the non retainer deletion.');
    }
    this.deleteOtherNodes(allRootChildren);
    this.deleteNonRetainerNodes(nodeToFocus, rootNode);

    this.removeCycles(rootNode, nodeToFocus);

    console.log('Cleanup...');
    // cleanup the graph
    this.deleteNonRetainerNodes(nodeToFocus, rootNode);
    this.removeAllIsolatedNodes();
    console.log('Focus on node - end!');
  }

  private deleteNonRetainerNodes(nodeToFocus: HeapNode, rootNode: HeapNode) {
    const retainerNodes = this.collectRetainers(nodeToFocus);
    if (!retainerNodes.has(rootNode)) {
      throw new Error('Root node is not a retainer of the node to focus');
    }
    this.deleteOtherNodes(retainerNodes);
  }

  private deleteOtherNodes(retainerNodes: Set<HeapNode>) {
    // Delete prev nodes not relevant to the node we focus on
    for (const [index, node] of [...this.nodeMap.entries()]) {
      if (!retainerNodes.has(node)) {
        this.deleteNode(index);
      }
    }
  }

  private deleteNode(indexInNodeMap) {
    const node = this.nodeMap.get(indexInNodeMap);
    if (!node) {
      throw new Error('Cannot find node to delete. Index: ' + indexInNodeMap);
    }
    node.disconnectNextNodes();
    node.disconnectPrevNodes();
    this.nodeMap.delete(indexInNodeMap);
  }

  private collectRetainers(nodeToFocus: HeapNode): Set<HeapNode> {
    const retainerNodes = new Set<HeapNode>([]);
    let queue = [nodeToFocus];
    while (queue.length > 0) {
      const prevNode = queue.pop();
      if (!retainerNodes.has(prevNode)) {
        retainerNodes.add(prevNode);
        const prevNodes = prevNode.getPrevNodes();
        while (prevNodes.length > 0) {
          const chunk = prevNodes.splice(0, 1000);
          queue.push(...chunk);
        }
      }
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
      const nodes = Array.from(tempStack.values());
      while (nodes.length > 0) {
        const chunk = nodes.splice(0, 1000);
        stack.push(...chunk);
      }
    }
    return children;
  }

  private removeCycles(rootNode: HeapNode, nodeToFocus: HeapNode) {
    console.log('removing cycles in the graph....');
    const visited = new Set<HeapNode>();
    visited.add(rootNode);

    let nexts = rootNode.getNextNodes();
    let layer = 0;
    while (nexts.length) {
      console.log(`removing cycles - layer: ${layer}. Layer size: ${nexts.length}.`);
      const nextLayer: HeapNode[] = [];
      for (const next of nexts) {
        if (!visited.has(next)) {
          for (const prevNode of next.getPrevNodes().filter(prev => !visited.has(prev))) {
            next.disconnectPrevNode(prevNode);
          }
        }
        nextLayer.push(...next.getNextNodes().filter(n => !visited.has(n)));
      }
      for (const visitedNode of nexts) {
        visited.add(visitedNode);
      }
      nexts = nextLayer;
      layer++;
      this.deleteNonRetainerNodes(nodeToFocus, rootNode);
    }
  }

  private disconnectEdgesWithName(...edgeNamesToDisconnect: string[]) {
    for (const node of this.nodeMap.values()) {
      for (const nextEdgeAndNode of node.getNextNodesAndEdges()) {
        for (const edgeNameToDelete of edgeNamesToDisconnect) {
          if (this.jsonHeapDump.strings[nextEdgeAndNode.edge.nameOrIndexToStrings] === edgeNameToDelete) {
            node.removeEdge(nextEdgeAndNode.node, nextEdgeAndNode.edge);
          }
        }
      }
    }
  }

  private disconnectEdgesWithType(...edgeTypesToDisconnect: string[]) {
    for (const node of this.nodeMap.values()) {
      for (const nextEdgeAndNode of node.getNextNodesAndEdges()) {
        for (const edgeTypeToDelete of edgeTypesToDisconnect) {
          if (this.jsonHeapDump.snapshot.meta.edge_types[0][nextEdgeAndNode.edge.type] === edgeTypeToDelete) {
            node.removeEdge(nextEdgeAndNode.node, nextEdgeAndNode.edge);
          }
        }
      }
    }
  }

  findNodeByName(name: string): HeapNode {
    for (const [nodeIndex, node] of this.nodeMap.entries()) {
      const nodeName = this.jsonHeapDump.strings[node.getNodeNameIndex()];
      if (nodeName === name) {
        return node;
      }
    }
    throw new Error('Cannot find node with name: ' + name)

  }

  private deleteAllDetachedNodes(nodeToExclude: HeapNode) {
    console.log('Removing all nodes with name starts with Detached (except the node to focus)...');
    for (const [nodeIndex, node] of this.nodeMap.entries()) {
      if (node === nodeToExclude) {
        continue;
      }
      if (this.jsonHeapDump.strings[node.getNodeNameIndex()].startsWith('Detached ')) {
        this.deleteNode(nodeIndex);
      }
    }
  }
}
