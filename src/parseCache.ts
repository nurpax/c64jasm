
import * as ast from './ast'
import { SourceLoc } from './ast'

var parser = require('./g_parser')

type readFileSyncFunc = (fname: string, loc: SourceLoc | undefined) => Buffer | undefined;

export default class {
    filenameToSource = new Map<string, Buffer | undefined>();
    sourceToAst = new Map<string, ast.AsmLine[]>();

    getFileContents(filename: string, loc: SourceLoc | undefined, guardedReadFileSync: readFileSyncFunc): Buffer|undefined {
        const contents = this.filenameToSource.get(filename);
        if (contents !== undefined) {
            return contents;
        }
        const src = guardedReadFileSync(filename, loc);
        this.filenameToSource.set(filename, src);
        return src;
    }

    parse(
        filename: string,
        loc: SourceLoc | undefined,
        guardedReadFileSync: readFileSyncFunc
    ): ast.AsmLine[] | undefined {
        const source = this.getFileContents(filename, loc, guardedReadFileSync);
        if (source === undefined) {
            return undefined;
        }
        const cachedAst = this.sourceToAst.get(filename);
        if (cachedAst !== undefined) {
            return cachedAst;
        }
        const ast = parser.parse(source.toString(), { source: filename });
        this.sourceToAst.set(filename, ast);
        return ast;
    }
}