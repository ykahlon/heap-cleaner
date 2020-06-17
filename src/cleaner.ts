import {GraphManager} from "./graph-manager";
import {readFileSync, writeFileSync} from 'fs';


// Reduces the heap snapshot with focus on a node with a given id or if not provided,
// on a single detached window found in the snapshot.
const run = async (filePath: string, nodeId: string | undefined) => {
  console.log('reading file - start!');
  const jsonData = await readFileSync(filePath, 'utf-8');
  console.log('reading file - end!');

  const graphManager = new GraphManager(JSON.parse(jsonData));
  const nodeIdToFocus = nodeId === undefined
      ? graphManager.findNodeByName('Detached Window').getNodeId()
      : parseInt(nodeId);
  graphManager.focusOnNode(nodeIdToFocus,
      graphManager.findNodeByName('(GC roots)').getNodeId());
  const jsonOutput = graphManager.exportGraphToJson();
  await writeFileSync('./output.heapsnapshot', jsonOutput, {encoding: 'utf-8'});
  console.log("See output in output.heapsnapshot");
};

console.log(process.argv.slice(2));
const appParams = process.argv.slice(2);
run(/* filePath */ appParams[0], /* nodeId */ appParams[1]).then();



