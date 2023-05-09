import { promises as fs, createReadStream } from 'fs'
import { extname } from 'path'
import { GraphManager } from './graph-manager'
import { type HeapSnapshotWorkerDispatcher } from './vendor/HeapSnapshotWorkerDispatcher'
import { HeapSnapshotLoader } from './vendor/HeapSnapshotLoader'
import { error, log } from './log'
import { JSHeapSnapshot } from './vendor/HeapSnapshot'

const printMessage = ({ string, values }: { string: string; values: Record<string, string> }) =>
  Object.keys(values).reduce((acc, key) => acc.replace(`{${key}}`, values[key]), string)

export const loadSnapshot = async (filePath: string) => {
  const readStream = createReadStream(filePath, {
    highWaterMark: 10 * 1024 * 1024,
    encoding: 'utf8',
  })
  const logStream: NodeJS.WriteStream = process.stdout
  const dispatcher = {
    sendEvent: (...args: any[]) => {
      logStream.clearLine(0)
      logStream.cursorTo(0)
      logStream.write(
        [
          new Date().toISOString(),
          'HeapSnapshotWorkerDispatcher',
          ...(args[0] === 'ProgressUpdate' ? printMessage(JSON.parse(args[1])) : args),
        ].join(' ')
      )
    },
    dispatchMessage: (...args: any[]) => log('HeapSnapshotWorkerDispatcher.dispatchMessage', ...args),
  } as unknown as HeapSnapshotWorkerDispatcher
  const loader = new HeapSnapshotLoader(dispatcher)
  const loaderPromise = new Promise<void>(function (resolve, reject) {
    readStream
      .on('data', function (chunk: string) {
        loader.write(chunk)
      })
      .on('end', function () {
        loader.close()
        resolve()
      })
      .on('error', reject)
  })

  await loaderPromise
  const snapshot = loader.buildSnapshot()
  logStream.write('\n')
  return snapshot
}

export const focusOnNode = (snapshot: JSHeapSnapshot, nodeIdToFocus: number) => {
  const graphManager = new GraphManager(snapshot)
  graphManager.focusOnNode(nodeIdToFocus, graphManager.findNodeByName('(GC roots)').getNodeId())
  const jsonOutput = graphManager.exportGraphToJson()
  return { jsonOutput, nodeIdToFocus }
}

// Reduces the heap snapshot with focus on a node with a given id or if not provided,
// on a single detached window found in the snapshot.
export const run = async (filePath: string, nodeIds: string[]) => {
  log(`reading file ${filePath} - start!`)
  const snapshot = await loadSnapshot(filePath)
  log('reading file - end!')

  const nodeIdsToFocus: number[] = []
  if (nodeIds.length === 0) {
    log('Looking for detached windows')
    const nodeIterator = snapshot.allNodes()
    for (const node = nodeIterator.item(); nodeIterator.hasNext(); nodeIterator.next()) {
      if (node.name() === 'Detached Window') {
        nodeIdsToFocus.push(node.id())
      }
    }
  } else {
    log('Nodes to focus provided')
    nodeIds.forEach((nodeId) => nodeIdsToFocus.push(parseInt(nodeId)))
  }
  log('Focusing on nodes', nodeIdsToFocus.join(', '))

  for (const nodeId of nodeIdsToFocus) {
    try {
      const { jsonOutput, nodeIdToFocus } = focusOnNode(snapshot, nodeId)

      const output = `${filePath.substring(
        0,
        filePath.length - extname(filePath).length
      )}-${nodeIdToFocus}.heapsnapshot`
      await fs.writeFile(output, JSON.stringify(jsonOutput), { encoding: 'utf-8' })
      log(`See output in ${output}`)
    } catch (err) {
      error(`Focusing on node ${nodeId} failed: ${(err as Error).stack ?? (err as Error).message ?? err}`)
    }
  }
}
