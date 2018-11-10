
import * as path from 'path'

import { readFileSync } from 'fs'
import * as ast from './ast'
import { SourceLoc } from './ast'

var parser = require('./g_parser')

export default class {
    filenameToSource = new Map<string, Buffer>();

    guardedReadFileSync: ((string, Loc) => Buffer) = undefined;

    constructor (guardedReadFileSync: (string, SourceLoc) => Buffer) {
        this.guardedReadFileSync = guardedReadFileSync;
    }

    getFileContents(filename, loc: SourceLoc|null) {
        const src = this.guardedReadFileSync(filename, loc).toString();
        return src;
    }

    parse(filename: string, loc: SourceLoc | null) {
        const source = this.getFileContents(filename, loc);
        const astLines = parser.parse(source, { source: filename });
        return astLines;
    }
}