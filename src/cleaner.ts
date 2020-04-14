import {GraphManager} from "./graph-manager";
import {readFileSync, writeFileSync} from 'fs';


// focusOnNode (by id)
const run = async () => {
    const jsonData = await readFileSync('./sample/leak_31715_7399.heapsnapshot', 'utf-8');
    const graphManager = new GraphManager(JSON.parse(jsonData));
    graphManager.focusOnNode(31715, 7399);
    const jsonOutput = graphManager.exportGraphToJson();
    await writeFileSync('./output.heapsnapshot', jsonOutput, {encoding: 'utf-8'});
    console.log("See output in output.heapsnapshot");
}


// noinspection JSUnusedLocalSymbols
const compare = async () => {
    const origJson = JSON.parse(await readFileSync('./sample/sample_heap_dump.heapsnapshot', 'utf-8'));
    const outputJson = JSON.parse(await readFileSync('./output.heapsnapshot', 'utf-8'));
    const traverse = origJson.edges;
    for (let i = 0; i < traverse.length; i++) {
       if (traverse[i] != outputJson.edges[i]) {
           debugger;
       }
    }

}

run().then();



