import { promises as fs, createReadStream } from 'fs'
import { extname } from 'path'
import { GraphManager } from './graph-manager'
import { type HeapSnapshotWorkerDispatcher } from './vendor/HeapSnapshotWorkerDispatcher'
import { HeapSnapshotLoader } from './vendor/HeapSnapshotLoader'
import { log } from './log'
import { JSHeapSnapshot } from './vendor/HeapSnapshot'

export const loadSnapshot = async (filePath: string) => {
  const readStream = createReadStream(filePath, {
    highWaterMark: 10 * 1024 * 1024,
    encoding: 'utf8',
  })
  const dispatcher = {
    sendEvent: (...args: any[]) => log('HeapSnapshotWorkerDispatcher.sendEvent', ...args),
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
  return loader.buildSnapshot()
}

export const focusOnNode = (snapshot: JSHeapSnapshot, nodeId: string | undefined) => {
  const graphManager = new GraphManager(snapshot)
  const nodeIdToFocus =
    nodeId === undefined ? graphManager.findNodeByName('Detached Window').getNodeId() : parseInt(nodeId)
  graphManager.focusOnNode(nodeIdToFocus, graphManager.findNodeByName('(GC roots)').getNodeId())
  const jsonOutput = graphManager.exportGraphToJson()
  return { jsonOutput, nodeIdToFocus }
}

// Reduces the heap snapshot with focus on a node with a given id or if not provided,
// on a single detached window found in the snapshot.
export const run = async (filePath: string, nodeId: string | undefined) => {
  log(`reading file ${filePath} - start!`)
  const snapshot = await loadSnapshot(filePath)
  log('reading file - end!')

  if (nodeId === undefined) {
    log('Looking for detached window')
  } else {
    log('Focusing on node', nodeId)
  }
  const { jsonOutput, nodeIdToFocus } = focusOnNode(snapshot, nodeId)

  const output = `${filePath.substring(0, filePath.length - extname(filePath).length)}-${nodeIdToFocus}.heapsnapshot`
  await fs.writeFile(output, JSON.stringify(jsonOutput), { encoding: 'utf-8' })
  log(`See output in ${output}`)
}
