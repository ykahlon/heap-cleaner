# Heap Cleaner - reduces the V8 heapsnapshot and focuses on a specific node for analyzing a memory leak.

## Usage

Just run src/cleaner.ts with the input file and optionally pass in a node id to focus.
If the node to focus is not provided, the program will try to find a detached window and focus on it.

```
node --require ts-node/register --max-old-space-size=16384 --stack-size=320000000 src/cleaner.ts sample/sample.heapsnapshot

```

