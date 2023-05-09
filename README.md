# Heap Cleaner - reduces the V8 heapsnapshot and focuses on a specific node for analyzing a memory leak.

## Usage

Just run src/bin.ts with the input file and optionally pass in a node id(s) to focus as last parameter(s).
If the node to focus is not provided, the program will try to find a detached windows and focus on it.
Output is minified heapsnapshot file (original file name with focused node id suffix).

```
npm run start sample/sample.heapsnapshot
npm run start sample/sample.heapsnapshot 123 456 789
```

or

```
node --require ts-node/register --max-old-space-size=32768 src/bin.ts sample/sample.heapsnapshot
```

or

```
npx heap-cleaner sample/sample.heapsnapshot
```

without need to clone the repo, but you will not be able to extend memory for big heap snapshots.
