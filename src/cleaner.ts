import {GraphManager} from "./graph-manager";
import {readFileSync, writeFileSync} from 'fs';

const run = async () => {
    const jsonData = await readFileSync('./sample/sample_heap_dump.json', 'utf-8');
    const graphManager = new GraphManager(JSON.parse(jsonData));
    const heapNodes = graphManager.constructGraph();
    const jsonOutput = graphManager.exportGraphToJson(heapNodes);
    await writeFileSync('./output.json', jsonOutput, {encoding: 'utf-8'})
    console.log("See output in output.json");
}
run().then();



