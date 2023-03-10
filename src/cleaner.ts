import { GraphManager } from './graph-manager'
import { promises as fs, createReadStream } from 'fs'
import { type HeapSnapshotWorkerDispatcher } from './vendor/HeapSnapshotWorkerDispatcher'
import { HeapSnapshotLoader } from './vendor/HeapSnapshotLoader'
import { log, error } from './log'

// Reduces the heap snapshot with focus on a node with a given id or if not provided,
// on a single detached window found in the snapshot.
const run = async (filePath: string, nodeId: string | undefined) => {
  log(`reading file ${filePath} - start!`)
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
  log('reading file - end!')
  const snapshot = loader.buildSnapshot()
  log('reading file - end!')

  const graphManager = new GraphManager(snapshot)
  const nodeIdToFocus =
    nodeId === undefined
      ? (log('Looking for detached window'), graphManager.findNodeByName('Detached Window').getNodeId())
      : (log('Focusing on node', nodeId), parseInt(nodeId))
  graphManager.focusOnNode(nodeIdToFocus, graphManager.findNodeByName('(GC roots)').getNodeId())
  const jsonOutput = graphManager.exportGraphToJson()
  await fs.writeFile('./output.heapsnapshot', JSON.stringify(jsonOutput), { encoding: 'utf-8' })
  log('See output in output.heapsnapshot')
}

const appParams = process.argv.slice(2)
run(/* filePath */ appParams[0], /* nodeId */ appParams[1])
  .then(() => log('done'))
  .catch((err) => error(err))
