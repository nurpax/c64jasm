
import * as ast from './ast'
import { SourceLoc } from './ast'

var parser = require('./g_parser')

export default class {
    filenameToSource = new Map<string, Buffer>();
    sourceToAst = new Map<string, ast.AsmLine[]>();

    guardedReadFileSync: ((string, Loc) => Buffer) = undefined;

    constructor (guardedReadFileSync: (string, SourceLoc) => Buffer) {
        this.guardedReadFileSync = guardedReadFileSync;
    }

    getFileContents(filename, loc: SourceLoc | null): Buffer {
        const contents = this.filenameToSource.get(filename);
        if (contents !== undefined) {
            return contents;
        }
        const src = this.guardedReadFileSync(filename, loc);
        this.filenameToSource.set(filename, src);
        return src;
    }

    parse(filename: string, loc: SourceLoc | null): ast.AsmLine[] {
        const source = this.getFileContents(filename, loc);
        const cachedAst = this.sourceToAst.get(filename);
        if (cachedAst !== undefined) {
            return cachedAst;
        }
        const ast = parser.parse(source.toString(), { source: filename });
        this.sourceToAst.set(filename, ast);
        return ast;
    }
}