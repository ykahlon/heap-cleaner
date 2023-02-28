import { GraphManager } from "./graph-manager";
import { createReadStream, writeFileSync } from "fs";
import * as json from "big-json";

// Reduces the heap snapshot with focus on a node with a given id or if not provided,
// on a single detached window found in the snapshot.
const run = async (filePath: string, nodeId: string | undefined) => {
  console.log(new Date().toISOString(), `reading file ${filePath} - start!`);
  let jsonData;
  const readStream = createReadStream(filePath, {
    highWaterMark: 10 * 1024 * 1024,
    encoding: "utf8",
  });
  const parseStream = json.createParseStream();
  readStream.pipe(parseStream);
  const loaderPromise = new Promise<void>(function (resolve, reject) {
    parseStream
      .on("data", function (pojo) {
        jsonData = pojo;
      })
      .on("end", function () {
        resolve();
      })
      .on("error", reject);
  });

  await loaderPromise;
  console.log(new Date().toISOString(), "reading file - end!");

  const graphManager = new GraphManager(jsonData);
  const nodeIdToFocus =
    nodeId === undefined
      ? (console.log('Looking for detached window'), graphManager.findNodeByName("Detached Window").getNodeId())
      : (console.log('Focusing on node', nodeId), parseInt(nodeId));
  graphManager.focusOnNode(
    nodeIdToFocus,
    graphManager.findNodeByName("(GC roots)").getNodeId()
  );
  const jsonOutput = graphManager.exportGraphToJson();
  await writeFileSync("./output.heapsnapshot", jsonOutput, {
    encoding: "utf-8",
  });
  console.log("See output in output.heapsnapshot");
};

const appParams = process.argv.slice(2);
run(/* filePath */ appParams[0], /* nodeId */ appParams[1])
  .then(() => console.log("done"))
  .catch((err) => console.error(err));
