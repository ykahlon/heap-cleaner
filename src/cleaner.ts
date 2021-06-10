import {GraphManager} from "./graph-manager";
import {writeFileSync, createReadStream} from 'fs';
const StreamObject = require( 'stream-json/streamers/StreamObject');
const {Writable} = require('stream');

// Reduces the heap snapshot with focus on a node with a given id or if not provided,
// on a single detached window found in the snapshot.
const run = async (filePath: string, nodeId: string | undefined) => {
  console.log('reading file - start!');
  let jsonData = {} as any;
  const fileStream = createReadStream(filePath);
  const jsonStream = StreamObject.withParser();
  const processingStream = new Writable({
    write({key, value}, encoding, callback) {
      // allows memory cleanup
      setTimeout(() => {
        console.log("- read:", key);
        jsonData[key] = value;
        callback();
      }, 0);
    },
    objectMode: true
  });

  fileStream.pipe(jsonStream.input);
  jsonStream.pipe(processingStream);

  processingStream.on('finish', async () => {
    console.log('reading file - end!');

    const graphManager = new GraphManager(jsonData);
    const nodeIdToFocus = nodeId === undefined
      ? graphManager.findNodeByName('Detached Window').getNodeId()
      : parseInt(nodeId);

    console.log("NodeID: ", nodeIdToFocus);

    graphManager.focusOnNode(nodeIdToFocus,
      graphManager.findNodeByName('(GC roots)').getNodeId());
    const jsonOutput = graphManager.exportGraphToJson();
    await writeFileSync('./output.heapsnapshot', jsonOutput, {encoding: 'utf-8'});
    console.log("See output in output.heapsnapshot");
  });
};

const appParams = process.argv.slice(2);
run(/* filePath */ appParams[0], /* nodeId */ appParams[1]).then();



