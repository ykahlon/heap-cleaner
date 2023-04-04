#!/usr/bin/env node
import { log, error } from './log'
import { run } from './index'

const appParams = process.argv.slice(2)
run(/* filePath */ appParams[0], /* nodeId */ appParams.slice(1))
  .then(() => log('done'))
  .catch((err) => error(err))
