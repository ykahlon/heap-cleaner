import { loadSnapshot, focusOnNode, run } from './index.js' // eslint-disable-line import/no-unresolved

export = Object.assign(run, { default: run, loadSnapshot, focusOnNode })
