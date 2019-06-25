
import opcodes from './opcodes'
import * as path from 'path'
const importFresh = require('import-fresh');

import { readFileSync } from 'fs'
import { toHex16 } from './util'
import * as ast from './ast'
import { SourceLoc } from './ast'
import ParseCache from './parseCache'
import { DebugInfoTracker } from './debugInfo';

interface Error {
    loc: SourceLoc,
    msg: string
}

interface LabelAddr {
    addr: number,
    loc: SourceLoc
}

interface EvalValue<T> {
    value: T;
    errors: boolean;
}

function mkErrorValue(v: number) {
    return { value: v, errors: true };
}

function mkEvalValue<T>(v: T) {
    return { value: v, errors: false };
}

function anyErrors(...args: (EvalValue<any> | undefined)[]) {
    return args.some(e => e !== undefined && e.errors);
}

class NamedScope<T> {
    syms: Map<string, T & {seen: number}> = new Map();
    readonly parent: NamedScope<T> | null = null;
    readonly name: string;
    children: Map<string, NamedScope<T>> = new Map();

    constructor (parent: NamedScope<T> | null, name: string) {
        this.parent = parent;
        this.name = name;
    }

    enter(name: string): NamedScope<T> {
        const s = this.children.get(name);
        if (s !== undefined) {
            return s;
        }
        const newScope = new NamedScope<T>(this, name);
        this.children.set(name, newScope);
        return newScope;
    }

    leave(): NamedScope<T> {
        return this.parent!;
    }

    // Find symbol from current and all parent scopes
    findSymbol(name: string): T & {seen: number} | undefined {
        for (let cur: NamedScope<T>|null = this; cur !== null; cur = cur.parent) {
            const n = cur.syms.get(name);
            if (n !== undefined) {
                return n;
            }
        }
        return undefined;
    }

    // Find relative label::path::sym style references from the symbol table
    findSymbolPath(path: string[]): T & {seen: number} | undefined {
        if (path.length == 1) {
            return this.findSymbol(path[0]);
        }

        // Go up the scope tree until we find the start of
        // the relative path.
        let tab: NamedScope<T> | null | undefined = this;
        while (tab.children.get(path[0]) == undefined) {
            tab = tab.parent;
            if (tab == null) {
                return undefined;
            }
        }

        // Go down the tree to match the path to a symbol
        for (let i = 0; i < path.length-1; i++) {
            tab = tab.children.get(path[i]);
            if (tab == undefined) {
                return undefined;
            }
        }
        return tab.syms.get(path[path.length-1]);
    }

    addSymbol(name: string, val: T, pass: number): void {
        this.syms.set(name, { ...val, seen: pass });
    }

    updateSymbol(name: string, val: T, pass: number) {
        for (let cur: NamedScope<T>|null = this; cur !== null; cur = cur.parent) {
            const v = cur.syms.get(name);
            if (v !== undefined) {
                cur.syms.set(name, { ...val, seen: pass });
                return;
            }
        }
    }

}

type SymEntry  = SymLabel | SymVar | SymMacro;

interface SymLabel {
    type: 'label';
    data: EvalValue<LabelAddr>;
}

interface SymVar {
    type: 'var';
    data: EvalValue<any>;
}

interface SymMacro {
    type: 'macro';
    data: ast.StmtMacro;
}

class Scopes {
    passCount: number = 0;
    root: NamedScope<SymEntry> = new NamedScope<SymEntry>(null, '');
    curSymtab = this.root;
    private anonScopeCount = 0;

    startPass(pass: number): void {
        this.curSymtab = this.root;
        this.anonScopeCount = 0;
        this.passCount = pass;
    }

    pushAnonScope(): void {
        this.pushLabelScope(`__anon_scope_${this.anonScopeCount}`);
        this.anonScopeCount++;
    }
    popAnonScope(): void {
        this.popLabelScope();
    }

    pushLabelScope(name: string): void {
        this.curSymtab = this.curSymtab.enter(name);
    }

    popLabelScope(): void {
        this.curSymtab = this.curSymtab.leave();
    }

    findPath(path: string[], absolute: boolean): SymEntry & {seen: number} | undefined {
        if (absolute) {
            return this.root.findSymbolPath(path);
        }
        return this.curSymtab.findSymbolPath(path);
    }

    findQualifiedSym(path: string[], absolute: boolean): SymEntry & {seen: number} | undefined {
        return this.findPath(path, absolute);
    }

    symbolSeen(name: string): boolean {
        const n = this.curSymtab.syms.get(name);
        if (n !== undefined) {
            return n.seen == this.passCount;
        }
        return false;
    }

    declareLabelSymbol(symbol: ast.Label, codePC: number): boolean {
        const { name, loc } = symbol;

        // As we allow name shadowing, we must look up the name
        // only from the current scope.  If we lookup parent
        // scopes for label declarations, we end up
        // mutating some unrelated, but same-named label names.
        const prevLabel = this.curSymtab.syms.get(name);
        if (prevLabel == undefined) {
            const lblsym: SymLabel = {
                type: 'label',
                data: mkEvalValue({ addr: codePC, loc })
            };
            this.curSymtab.addSymbol(name, lblsym, this.passCount);
            return false;
        }
        if (prevLabel.type !== 'label') {
            throw new Error('ICE: declareLabelSymbol should be called only on labels');
        }
        const lbl = prevLabel;
        // If label address has changed change, need one more pass
        if (lbl.data.value.addr !== codePC) {
            const newSymValue: SymLabel = {
                type: 'label',
                data: {
                    ...prevLabel.data,
                    value: {
                        ...prevLabel.data.value,
                        addr: codePC
                    }
                }
            }
            this.curSymtab.updateSymbol(name, newSymValue, this.passCount);
            return true;
        }
        // Update to mark the label as "seen" in this pass
        this.curSymtab.updateSymbol(name, prevLabel, this.passCount);
        return false;
    }

    declareVar(name: string, value: EvalValue<any>): void {
        this.curSymtab.addSymbol(name, {
            type: 'var',
            data: value
        }, this.passCount)
    }

    updateVar(path: string[], absolute: boolean, val:any) {
        if (path.length !== 1 || absolute) {
            throw new Error('should not happen TBD');
        }
        const prevVar = this.curSymtab.findSymbol(path[0]);
        if (prevVar == undefined || prevVar.type !== 'var') {
            throw new Error('should not happen');
        }
        const newVar: SymVar = {
            type: 'var',
            data: val
        };
        this.curSymtab.updateSymbol(path[0], newVar, this.passCount);
    }

    findMacro(path: string[], absolute: boolean): ast.StmtMacro | undefined {
        const sym = this.findPath(path, absolute);
        if (sym !== undefined && sym.type == 'macro') {
            return sym.data;
        }
        return undefined;
    }

    declareMacro(name: string, value: ast.StmtMacro): void {
        this.curSymtab.addSymbol(name, {
            type: 'macro',
            data: value
        }, this.passCount)
    }

    dumpLabels(codePC: number) {
        type StackEntry = {prefix: string, sym: NamedScope<SymEntry>};
        const stack: StackEntry[] = [];
        const pushScope = (prefix: string, sym: NamedScope<SymEntry>) => {
            stack.push({ prefix: `${prefix}/${sym.name}`, sym });
        }
        pushScope('', this.root);

        const labels = [];
        while (stack.length > 0) {
            const s = stack.pop()!;
            for (let [k,lbl] of s.sym.syms) {
                if (lbl.type == 'label') {
                    labels.push({ name: `${s.prefix}/${k}`, addr: lbl.data.value.addr, size: 0 });
                }
            }
            for (let [k, sym] of s.sym.children) {
                pushScope(s.prefix, sym);
            }
        }

        const sortedLabels = labels.sort((a, b) => {
            return a.addr - b.addr;
        })

        const numLabels = sortedLabels.length;
        if (numLabels > 0) {
            for (let i = 1; i < numLabels; i++) {
                sortedLabels[i-1].size = sortedLabels[i].addr - sortedLabels[i-1].addr;
            }
            const last = sortedLabels[numLabels-1];
            last.size = codePC - last.addr;
        }
        return sortedLabels;
    }
}

function isTrueVal(cond: number | boolean): boolean {
    return (cond === true || cond != 0);
}

function makeCompileLoc(filename: string) {
    // SourceLoc can be undefined here if parse is executed out of AST
    // (e.g., source file coming from CLI), so make up an error loc for it.
    return {
        source: filename,
        start: { offset: 0, line: 0, column: 0 },
        end: { offset: 0, line: 0, column: 0 }
    };
}

function formatSymbolPath(p: ast.ScopeQualifiedIdent): string {
    return `${p.absolute ? '::' : ''}${p.path.join('::')}`;
}

interface BranchOffset {
    offset: number;
    loc: SourceLoc;
}

const runBinopNum = (a: EvalValue<number>, b: EvalValue<number>, f: (a: number, b: number) => number | boolean): EvalValue<number> => {
    if (anyErrors(a, b)) {
        return mkErrorValue(0);
    }
    const res = f(a.value as number, b.value as number);
    if (typeof res == 'boolean') {
        return mkEvalValue(res ? 1 : 0);
    }
    return mkEvalValue(res);
}

const runUnaryOp = (a: EvalValue<number>, f: (a: number) => number | boolean): EvalValue<number> => {
    if (anyErrors(a)) {
        return mkErrorValue(0);
    }
    const res = f(a.value as number);
    if (typeof res == 'boolean') {
        return mkEvalValue(res ? 1 : 0);
    }
    return mkEvalValue(res);
}

class Assembler {
    // TODO this should be a resizable array instead
    binary: number[] = [];

    parseCache = new ParseCache();
    pluginCache = new Map();

    includeStack: string[] = [];
    codePC = 0;
    pass = 0;
    needPass = false;
    scopes = new Scopes();
    errorList: Error[] = [];
    outOfRangeBranches: BranchOffset[] = [];

    // PC<->source location tracking for debugging support.  Reset on each pass
    debugInfo = new DebugInfoTracker();

    prg (): Buffer {
      // 1,8 is for encoding the $0801 starting address in the .prg file
      return Buffer.from([1, 8].concat(this.binary))
    }

    parse (filename: string, loc: SourceLoc | undefined) {
        const l = loc == undefined ? makeCompileLoc(filename) : loc;
        return this.parseCache.parse(filename, loc, ((fname, _loc) => this.guardedReadFileSync(fname, l)));
    }

    // Cache plugin require's so that we fresh require() them only in the first pass.
    // importFresh is somewhat slow because it blows through Node's cache
    // intentionally.  We don't want it completely cached because changes to plugin
    // code must trigger a recompile and in that case we want the plugins really
    // reloaded too.
    requirePlugin(fname: string): any {
        const p = this.pluginCache.get(fname);
        if (p !== undefined) {
            return p;
        }
        const newPlugin = importFresh(path.resolve(this.makeSourceRelativePath(fname)));
        this.pluginCache.set(fname, newPlugin);
        return newPlugin;
    }

    peekSourceStack (): string {
        const len = this.includeStack.length;
        return this.includeStack[len-1];
    }

    pushSource (fname: string): void {
        this.includeStack.push(fname);
    }

    popSource (): void {
        this.includeStack.pop();
    }

    anyErrors (): boolean {
        return this.errorList.length !== 0;
    }

    errors = () => {
        // Remove duplicate errors
        const set = new Set(this.errorList.map(v => JSON.stringify(v)));
        return [...set].map((errJson) => {
            const { loc, msg } = JSON.parse(errJson);
            let formatted = `<unknown>:1:1: error: ${msg}`
            if (loc) {
                formatted = `${loc.source}:${loc.start.line}:${loc.start.column}: error: ${msg}`
            }
            return {
                loc,
                msg,
                formatted
            }
        })
    }

    addError (msg: string, loc: SourceLoc): void {
        this.errorList.push({ msg, loc });
    }

    startPass (pass: number): void {
      this.codePC = 0x801;
      this.pass = pass;
      this.needPass = false;
      this.binary = [];
      this.errorList = [];
      this.scopes.startPass(pass);
      this.outOfRangeBranches = [];
      this.debugInfo = new DebugInfoTracker();
    }

    emitBasicHeader () {
      this.emit(0x0c);
      this.emit(0x08);
      this.emit(0x00);
      this.emit(0x00);
      this.emit(0x9e);
      const addr = 0x80d
      const dividers = [10000, 1000, 100, 10, 1]
      dividers.forEach(div => {
        if (addr >= div) {
          this.emit(0x30 + (addr / div) % 10)
        }
      });
      this.emit(0);
      this.emit(0);
      this.emit(0);
    }

    emitBinary (ast: ast.StmtBinary): void {
        const { filename } = ast;
        const evalFname = this.evalExprToString(filename, "!binary filename");

        let offset = mkEvalValue(0);
        let size = undefined;
        if (ast.size !== null) {
            if (ast.offset !== null) {
                offset = this.evalExprToInt(ast.offset, "!binary offset");
            }
            if (ast.size !== null) {
                size = this.evalExprToInt(ast.size, "!binary size");
            }
        }

        // Don't try to load or emit anything if there was an error
        if (anyErrors(evalFname, offset, size)) {
            return;
        }

        const fname = this.makeSourceRelativePath(evalFname.value);
        const buf: Buffer = this.guardedReadFileSync(fname, ast.loc);
        let numBytes = buf.byteLength;
        if (size) {
            numBytes = size.value;
        }

        // TODO buffer overflow
        for (let i = 0; i < numBytes; i++) {
            this.emit(buf.readUInt8(i + offset.value));
        }
    }

    // Type-error checking variant of evalExpr
    evalExprType<T>(node: ast.Expr, ty: 'number'|'string'|'object', msg: string): EvalValue<T> {
        const res = this.evalExpr(node);
        const { errors, value } = res;
        if (!errors && typeof value !== ty) {
            this.addError(`Expecting ${msg} to be '${ty}' type, got '${typeof value}'`, node.loc);
            return {
                errors: true, value
            }
        }
        return res;
    }

    // Type-error checking variant of evalExpr
    evalExprToInt(node: ast.Expr, msg: string): EvalValue<number> {
        return this.evalExprType(node, 'number', msg);
    }

    evalExprToString(node: ast.Expr, msg: string): EvalValue<string> {
        return this.evalExprType(node, 'string', msg);
    }

    evalExpr(node: ast.Expr): EvalValue<any> {
        switch (node.type) {
            case 'binary': {
                const left = this.evalExpr(node.left);
                const right = this.evalExpr(node.right);
                switch (node.op) {
                    case '+': return  runBinopNum(left, right, (a,b) => a + b)
                    case '-': return  runBinopNum(left, right, (a,b) => a - b)
                    case '*': return  runBinopNum(left, right, (a,b) => a * b)
                    case '/': return  runBinopNum(left, right, (a,b) => a / b)
                    case '%': return  runBinopNum(left, right, (a,b) => a % b)
                    case '&': return  runBinopNum(left, right, (a,b) => a & b)
                    case '|': return  runBinopNum(left, right, (a,b) => a | b)
                    case '^': return  runBinopNum(left, right, (a,b) => a ^ b)
                    case '<<': return runBinopNum(left, right, (a,b) => a << b)
                    case '>>': return runBinopNum(left, right, (a,b) => a >> b)
                    case '==': return runBinopNum(left, right, (a,b) => a == b)
                    case '!=': return runBinopNum(left, right, (a,b) => a != b)
                    case '<':  return runBinopNum(left, right, (a,b) => a <  b)
                    case '<=': return runBinopNum(left, right, (a,b) => a <= b)
                    case '>':  return runBinopNum(left, right, (a,b) => a >  b)
                    case '>=': return runBinopNum(left, right, (a,b) => a >= b)
                    case '&&': return runBinopNum(left, right, (a,b) => a && b)
                    case '||': return runBinopNum(left, right, (a,b) => a || b)
                    default:
                        throw new Error(`Unhandled binary operator ${node.op}`);
                }
            }
            case 'unary': {
                const v = this.evalExprToInt(node.expr, 'operand');
                if (v.errors) {
                    return v;
                }
                switch (node.op) {
                    case '+': return runUnaryOp(v, v => +v);
                    case '-': return runUnaryOp(v, v => -v);
                    case '~': return runUnaryOp(v, v => ~v);
                    default:
                        throw new Error(`Unhandled unary operator ${node.op}`);
                }
            }
            case 'literal': {
                return mkEvalValue(node.lit);
            }
            case 'array': {
                const evals = node.list.map(v => this.evalExpr(v));
                return {
                    value: evals.map(e => e.value),
                    errors: anyErrors(...evals)
                }
            }
            case 'ident': {
                throw new Error('should not see an ident here -- if you do, it is probably a wrong type node in parser')
            }
            case 'qualified-ident': {
                // Namespace qualified ident, like foo::bar::baz
                const sym = this.scopes.findQualifiedSym(node.path, node.absolute);
                if (sym == undefined) {
                    if (this.pass >= 1) {
                        this.addError(`Undefined symbol '${formatSymbolPath(node)}'`, node.loc)
                        return mkErrorValue(0);
                    }
                    // Return a placeholder that should be resolved in the next pass
                    this.needPass = true;
                    return mkEvalValue(0);
                }

                switch (sym.type) {
                    case 'label':
                        return {
                            errors: sym.data.errors,
                            value: sym.data.value.addr
                        }
                    case 'var':
                        if (sym.seen < this.pass) {
                            this.addError(`Undeclared variable '${formatSymbolPath(node)}`, node.loc);
                        }
                        return sym.data;
                    case 'macro':
                        this.addError(`Must have a label or a variable identifier here, got macro name`, node.loc);
                        return mkErrorValue(0);
                }
                break;
            }
            case 'member': {
                // TODO if there are errors, should just return or how to continue??
                const evaledObject = this.evalExpr(node.object);

                const { value: object } = evaledObject;

                if (object == undefined) {
                    this.addError(`Cannot access properties of an unresolved symbol'`, node.loc);
                    return mkErrorValue(0);
                }

                const checkProp = (prop: string|number, loc: SourceLoc) => {
                    if (!(prop in object)) {
                        this.addError(`Property '${prop}' does not exist in object`, loc);
                        return false;
                    }
                    return true;
                }

                // Eval non-computed access (array, object)
                const evalProperty = (node: ast.Member, typeName: string) => {
                    if (node.property.type !== 'ident') {
                        this.addError(`${typeName} property must be a string, got ${typeof node.property.type}`, node.loc);
                    } else {
                        if (checkProp(node.property.name, node.property.loc)) {
                            return mkEvalValue((object as any)[node.property.name])
                        }
                    }
                    return mkErrorValue(0);
                }

                if (object instanceof Array) {
                    if (!node.computed) {
                        return evalProperty(node, 'Array');
                    }
                    const { errors, value: idx } = this.evalExprToInt(node.property, 'array index');
                    if (errors) {
                        return mkErrorValue(0);
                    }
                    if (!(idx in object)) {
                        this.addError(`Out of bounds array index ${idx}`, node.property.loc)
                        return mkErrorValue(0);
                    }
                    return mkEvalValue(object[idx]);
                }  else if (typeof object == 'object') {
                    if (!node.computed) {
                        return evalProperty(node, 'Object');
                    } else {
                        let { errors, value: prop } = this.evalExpr(node.property);
                        if (errors) {
                            return mkErrorValue(0);
                        }
                        if (typeof prop !== 'string' && typeof prop !== 'number') {
                            this.addError(`Object property must be a string or an integer, got ${typeof prop}`, node.loc);
                            return mkErrorValue(0);
                        }
                        if (checkProp(prop, node.property.loc)) {
                            return mkEvalValue(object[prop]);
                        }
                        return mkErrorValue(0);
                    }
                }

                // Don't report errors in first compiler pass because an identifier may
                // still have been unresolved.  These cases should be reported by
                // name resolution in pass 1.
                if (this.pass !== 0) {
                    if (!evaledObject.errors) {
                        if (node.computed) {
                            this.addError(`Cannot use []-operator on non-array/object values`, node.loc)
                        } else {
                            this.addError(`Cannot use the dot-operator on non-object values`, node.loc)
                        }
                    }
                    return mkErrorValue(0);
                }
                return mkEvalValue(0); // dummy value as we couldn't resolve in pass 0
            }
            case 'callfunc': {
                const callee = this.evalExpr(node.callee);
                const argValues = node.args.map(expr => this.evalExpr(expr));
                if (callee.errors) {
                    return mkErrorValue(0); // suppress further errors if the callee is bonkers
                }
                if (typeof callee.value !== 'function') {
                    this.addError(`Callee must be a function type.  Got '${typeof callee}'`, node.loc);
                    return mkErrorValue(0);
                }
                if (anyErrors(...argValues)) {
                    return mkErrorValue(0);
                }
                try {
                    return mkEvalValue(callee.value(argValues.map(v => v.value)));
                } catch(err) {
                    if (node.callee.type == 'qualified-ident') {
                        this.addError(`Call to '${formatSymbolPath(node.callee)}' failed with an error: ${err.message}`, node.loc);
                    } else {
                        // Generic error message as callees that are computed
                        // expressions have lost their name once we get here.
                        this.addError(`Plugin call failed with an error: ${err.message}`, node.loc);
                    }
                    return mkErrorValue(0);
                }
            }
            default:
                break;
        }
        throw new Error('should be unreachable?');
        return mkErrorValue(0); // TODO is this even reachable?
    }

    emit (byte: number): void {
        this.binary.push(byte);
        this.codePC += 1
    }

    emit16 (word: number): void {
        this.emit(word & 0xff);
        this.emit((word>>8) & 0xff);
    }

    // TODO shouldn't have any for opcode
    checkSingle (opcode: number | null): boolean {
        if (opcode === null) {
            return false;
        }
        this.emit(opcode)
        return true;
    }

    checkImm (param: any, opcode: number | null): boolean {
        if (opcode === null || param === null) {
            return false;
        }
        const ev = this.evalExprToInt(param, 'immediate');
        if (!anyErrors(ev)) {
            this.emit(opcode);
            this.emit(ev.value);
        }
        return true;
    }

    checkAbs (param: any, opcode: number | null, bits: number): boolean {
        if (opcode === null || param === null) {
            return false;
        }
        const ev = this.evalExprToInt(param, 'absolute address');
        if (anyErrors(ev)) {
            return true;
        }
        const { value: v } = ev;
        if (bits === 8) {
            if (v < 0 || v >= (1<<bits)) {
                return false;
            }
            this.emit(opcode);
            this.emit(v);
        } else {
            this.emit(opcode);
            this.emit16(v);
        }
        return true
    }

    checkBranch (param: any, opcode: number | null): boolean {
        if (opcode === null || param === null) {
            return false;
        }
        const ev = this.evalExpr(param);
        if (anyErrors(ev)) {
            return true;
        }
        if (typeof ev.value !== 'number') {
            this.addError(`Expecting branch label to evaluate to integer, got ${typeof ev.value}`, param.loc)
            return true;
        }
        const { value: addr } = ev;
        const addrDelta = addr - this.codePC - 2;
        this.emit(opcode);
        if (addrDelta > 0x7f || addrDelta < -128) {
            // Defer reporting out of 8-bit range branch targets to the end of the
            // current pass (or report nothing if we need another pass.)
            this.outOfRangeBranches.push({ loc: param.loc, offset: addrDelta });
        }
        this.emit(addrDelta & 0xff);
        return true;
      }

    setPC (valueExpr: ast.Expr): void {
        const ev  = this.evalExprToInt(valueExpr, 'pc');
        if (!anyErrors(ev)) {
            const { value: v } = ev;
            if (this.codePC > v) {
                // TODO this is not great.  Actually need to track which ranges of memory have something in them.
                this.addError(`Cannot set program counter to a smaller value than current (current: $${toHex16(this.codePC)}, trying to set $${toHex16(v)})`, valueExpr.loc)
            }
            while (this.codePC < v) {
                this.emit(0);
            }
        }
    }

    guardedReadFileSync(fname: string, loc: SourceLoc): Buffer {
        try {
            return readFileSync(fname);
        } catch (err) {
            this.addError(`Couldn't open file '${fname}'`, loc);
            return Buffer.from([]);
        }
    }

    fileInclude (inclStmt: ast.StmtInclude): void {
        const fnVal = this.evalExprToString(inclStmt.filename, '!include filename');
        if (anyErrors(fnVal)) {
            return;
        }
        const v = fnVal.value;
        const fname = this.makeSourceRelativePath(v);
        this.pushSource(fname);
        this.assemble(fname, inclStmt.loc);
        this.popSource();
    }

    fillBytes (n: ast.StmtFill): void {
        const numVals = this.evalExprToInt(n.numBytes, '!fill num_bytes');
        const fillValue = this.evalExprToInt(n.fillValue, '!fill value');
        if (anyErrors(numVals, fillValue)) {
            return;
        }

        const { value: fv } = fillValue;
        if (fv < 0 || fv >= 256) {
            this.addError(`!fill value to repeat must be in 8-bit range, '${fv}' given`, n.fillValue.loc);
            return;
        }
        const nb = numVals.value;
        if (nb < 0) {
            this.addError(`!fill repeat count must be >= 0, got ${nb}`, n.numBytes.loc);
            return;
        }
        for (let i = 0; i < nb; i++) {
            this.emit(fv);
        }
    }

    alignBytes (n: ast.StmtAlign): void {
        const v = this.evalExprToInt(n.alignBytes, 'alignment');
        if (anyErrors(v)) {
            return;
        }
        const { value: nb } = v;
        if (nb < 1) {
            this.addError(`Alignment must be a positive integer, ${nb} given`, n.alignBytes.loc);
            return;
        }
        if ((nb & (nb-1)) != 0) {
            this.addError(`Alignment must be a power of two, ${nb} given`, n.loc);
            return;
        }
        while ((this.codePC & (nb-1)) != 0) {
            this.emit(0);
        }
    }

    // Enter anonymous block scope
    withAnonScope(name: string | null, compileScope: () => void): void {
        if (name !== null) {
            return this.withLabelScope(name, compileScope);
        }
        this.scopes.pushAnonScope();
        compileScope();
        this.scopes.popAnonScope();
    }

    // Enter named scope
    withLabelScope (name: string, compileScope: () => void): void {
        this.scopes.pushLabelScope(name);
        compileScope();
        this.scopes.popLabelScope();
    }

    emit8or16(v: number, bits: number) {
        if (bits == 8) {
            this.emit(v);
            return;
        }
        this.emit16(v);
    }

    emitData (exprList: ast.Expr[], bits: number) {
        for (let i = 0; i < exprList.length; i++) {
            const ee = this.evalExpr(exprList[i]);
            if (anyErrors(ee)) {
                continue;
            }
            const { value: e } = ee;
            if (typeof e == 'number') {
                this.emit8or16(e, bits);
            } else if (e instanceof Array) {
                // TODO function 'assertType' that returns the value and errors otherwise
                for (let bi in e) {
                    this.emit8or16(e[bi], bits);
                }
            } else {
                this.addError(`Only literal (int constants) or array types can be emitted.  Got ${typeof e}`, exprList[i].loc);
            }
        }
    }

    makeFunction (pluginFunc: Function, loc: SourceLoc) {
        return (args: any[]) => {
            const res = pluginFunc({
                readFileSync,
                resolveRelative: (fn: string) => this.makeSourceRelativePath(fn)
            }, ...args);
            return res;
        }
    }

    bindFunction (name: ast.Ident, pluginModule: any, loc: SourceLoc) {
        this.scopes.declareVar(name.name, mkEvalValue(this.makeFunction(pluginModule, loc)));
    }

    bindPlugin (node: ast.StmtLoadPlugin, pluginModule: any) {
        const moduleName = node.moduleName;
        // Bind default export as function
        if (typeof pluginModule == 'function') {
            this.bindFunction(moduleName, pluginModule, node.loc);
        }
        if (typeof pluginModule == 'object') {
            const moduleObj: any = {};
            const keys = Object.keys(pluginModule);
            for (let ki in keys) {
                const key = keys[ki];
                const func = pluginModule[key];
                moduleObj[key] = this.makeFunction(func, node.loc);
            }
            this.scopes.declareVar(moduleName.name, mkEvalValue(moduleObj));
        }
    }

    checkDirectives (node: ast.Stmt, localScopeName: string | null): void {
        switch (node.type) {
            case 'data': {
                this.emitData(node.values, node.dataSize === ast.DataSize.Byte ? 8 : 16);
                break;
            }
            case 'fill': {
                this.fillBytes(node);
                break;
            }
            case 'align': {
                this.alignBytes(node);
                break;
            }
            case 'setpc': {
                this.setPC(node.pc);
                break;
            }
            case 'binary': {
                this.emitBinary(node);
                break;
            }
            case 'include': {
                this.fileInclude(node);
                break;
            }
            case 'error': {
                const msg = this.evalExprToString(node.error, 'error message');
                if (!anyErrors(msg)) {
                    this.addError(msg.value, node.loc);
                    return;
                }
                break;
            }
            case 'if': {
                const { cases, elseBranch } = node
                for (let ci in cases) {
                    const [condExpr, body] = cases[ci];
                    const condition = this.evalExpr(condExpr);
                    // TODO condition.value type must be numeric/boolean
                    if (!anyErrors(condition) && isTrueVal(condition.value)) {
                        return this.withAnonScope(localScopeName, () => {
                            this.assembleLines(body);
                        });
                    }
                }
                return this.withAnonScope(localScopeName, () => {
                    this.assembleLines(elseBranch);
                })
                break;
            }
            case 'for': {
                const { index, list, body, loc } = node
                const lstVal = this.evalExpr(list);
                if (anyErrors(lstVal)) {
                    return;
                }
                const { value: lst } = lstVal;
                if (!(lst instanceof Array)) {
                    this.addError(`for-loop range must be an array expression (e.g., a range() or an array)`, list.loc);
                    return;
                }
                for (let i = 0; i < lst.length; i++) {
                    let scopeName = null;
                    if (localScopeName !== null) {
                        scopeName = `${localScopeName}__${i}`
                    }
                    this.withAnonScope(scopeName, () => {
                        this.scopes.declareVar(index.name, mkEvalValue(lst[i]));
                        return this.assembleLines(body);
                    });
                }
                break;
            }
            case 'macro': {
                const { name, args, body } = node;
                // TODO check for duplicate arg names!
                const prevMacro = this.scopes.findMacro([name.name], false);
                if (prevMacro !== undefined && this.scopes.symbolSeen(name.name)) {
                    // TODO previous declaration from prevMacro
                    this.addError(`Macro '${name.name}' already defined`, name.loc);
                    return;
                }
                this.scopes.declareMacro(name.name, node);
                break;
            }
            case 'callmacro': {
                const { name, args } = node;
                const macro = this.scopes.findMacro(name.path, name.absolute);

                const argValues = args.map(e => this.evalExpr(e));

                if (macro == undefined) {
                    this.addError(`Undefined macro '${formatSymbolPath(name)}'`, name.loc);
                    return;
                }

                if (macro.args.length !== args.length) {
                    this.addError(`Macro '${formatSymbolPath(name)}' declared with ${macro.args.length} args but called here with ${args.length}`,
                        name.loc);
                    return;
                }

                this.withAnonScope(localScopeName, () => {
                    for (let i = 0; i < argValues.length; i++) {
                        const argName = macro.args[i].ident.name;
                        this.scopes.declareVar(argName, argValues[i]);
                    }
                    this.assembleLines(macro.body);
                });
                break;
            }
            case 'let': {
                const name = node.name;
                const sym = this.scopes.findQualifiedSym([name.name], false);
                const eres = this.evalExpr(node.value);

                if (sym !== undefined && this.scopes.symbolSeen(name.name)) {
                    this.addError(`Variable '${name.name}' already defined`, node.loc);
                    return;
                }
                this.scopes.declareVar(name.name, eres);
                break;
            }
            case 'assign': {
                const name = node.name;
                const prevValue = this.scopes.findQualifiedSym(node.name.path, node.name.absolute);
                if (prevValue == undefined) {
                    this.addError(`Assignment to undeclared variable '${formatSymbolPath(name)}'`, node.loc);
                    return;
                }
                if (prevValue.type !== 'var') {
                    this.addError(`Assignment to symbol '${formatSymbolPath(name)}' that is not a variable.  Its type is '${prevValue.type}'`, node.loc);
                    return;
                }
                const evalValue = this.evalExpr(node.value);
                this.scopes.updateVar(name.path, name.absolute, evalValue);
                break;
            }
            case 'load-plugin': {
                const fname = this.evalExprToString(node.filename, 'plugin filename');
                if (anyErrors(fname)) {
                    return;
                }
                const pluginModule = this.requirePlugin(fname.value);
                this.bindPlugin(node, pluginModule);
                break;
            }
            case 'filescope': {
                this.addError(`The !filescope directive is only allowed as the first directive in a source file`, node.loc);
                return;
            }
            default:
                this.addError(`unknown directive ${node.type}`, node.loc);
                return;
        }
    }

    assembleLines (lst: ast.AsmLine[]): void {
        if (lst === null || lst.length == 0) {
            return;
        }
        if (lst.length == 0) {
            return;
        }

        const assemble = (lines: ast.AsmLine[]) => {
            for (let i = 0; i < lines.length; i++) {
                this.debugInfo.startLine(lines[i].loc, this.codePC);
                this.assembleLine(lines[i]);
                this.debugInfo.endLine(this.codePC);
            }
        }

        // Scan for the first real instruction line to skip
        // comments and empty lines at the start of a file.
        let firstLine = 0;
        while (firstLine < lst.length) {
            const { label, stmt, scopedStmts } = lst[firstLine];
            if (label == null && stmt == null && scopedStmts == null) {
                firstLine++;
            } else {
                break;
            }
        }
        if (firstLine >= lst.length) {
            return;
        }


        // Handle 'whole file scope' directive !filescope.  This puts everything
        // below the first line inside a named scope.
        const labelScope = lst[firstLine]!;
        if (labelScope.stmt != null && labelScope.stmt.type == 'filescope') {
            this.checkAndDeclareLabel(labelScope.stmt.name);
            return this.withLabelScope(labelScope.stmt.name.name, () => {
                return assemble(lst.slice(firstLine+1));
            });
        }
        return assemble(lst);

    }

    checkAndDeclareLabel(label: ast.Label) {
        if (this.scopes.symbolSeen(label.name)) {
            this.addError(`Label '${label.name}' already defined`, label.loc);
        } else {
            const labelChanged = this.scopes.declareLabelSymbol(label, this.codePC);
            if (labelChanged) {
                this.needPass = true;
            }
        }
    }

    assembleLine (line: ast.AsmLine): void {
        // Empty lines are no-ops
        if (line.label == null && line.stmt == null && line.scopedStmts == null) {
            return;
        }

        if (line.label !== null) {
            this.checkAndDeclareLabel(line.label);
        }

        const scopedStmts = line.scopedStmts;
        if (scopedStmts != null) {
            if (!line.label) {
                throw new Error('ICE: line.label cannot be undefined');
            }
            this.withLabelScope(line.label.name, () => {
                this.assembleLines(scopedStmts);
            });
            return;
        }

        if (line.stmt === null) {
            return;
        }

        if (line.stmt.type !== 'insn') {
            this.checkDirectives(line.stmt, line.label == null ? null : line.label.name);
            return;
        }

        const stmt = line.stmt
        const insn = stmt.insn
        const op = opcodes[insn.mnemonic.toUpperCase()]
        if (op !== undefined) {
            let noArgs =
                insn.imm === null
                && insn.abs === null
                && insn.absx === null
                && insn.absy === null
                && insn.absind === null
            if (noArgs && this.checkSingle(op[10])) {
                return;
            }
            if (this.checkImm(insn.imm, op[0])) {
                return;
            }
            if (this.checkAbs(insn.abs, op[1], 8)) {
                return;
            }

            if (this.checkAbs(insn.absx, op[2], 8)) {
                return;
            }
            if (this.checkAbs(insn.absy, op[3], 8)) {
                return;
            }

            if (this.checkAbs(insn.absx, op[5], 16)) {
                return;
            }
            if (this.checkAbs(insn.absy, op[6], 16)) {
                return;
            }
            // Absolute indirect
            if (this.checkAbs(insn.absind, op[7], 16)) {
                return;
            }

            if (this.checkAbs(insn.indx, op[8], 8)) {
                return;
            }
            if (this.checkAbs(insn.indy, op[9], 8)) {
                return;
            }

            if (this.checkAbs(insn.abs, op[4], 16)) {
                return;
            }
            if (this.checkBranch(insn.abs, op[11])) {
                return;
            }
            this.addError(`Couldn't encode instruction '${insn.mnemonic}'`, line.loc);
        } else {
            this.addError(`Unknown mnemonic '${insn.mnemonic}'`, line.loc);
        }
    }

    makeSourceRelativePath(filename: string): string {
        const curSource = this.peekSourceStack();
        return path.join(path.dirname(curSource), filename);
    }

    assemble (filename: string, loc: SourceLoc | undefined): void {
        try {
            const astLines = this.parse(filename, loc);
            this.assembleLines(astLines);
        } catch(err) {
            if ('name' in err && err.name == 'SyntaxError') {
                this.addError(`Syntax error: ${err.message}`, {
                    ...err.location,
                    source: this.peekSourceStack()
                })
            } else if ('name' in err && err.name == 'semantic') {
                return;
            } else {
                throw err;
            }
        }
    }

    _requireType(e: any, type: string): (any | never) {
        if (typeof e == type) {
            return e;
        }
        this.addError(`Expecting a ${type} value, got ${typeof e}`, e.loc);
    }

    requireString(e: any): (string | never) { return this._requireType(e, 'string') as string; }
    requireNumber(e: ast.Literal): (number | never) { return this._requireType(e, 'number') as number; }

    registerPlugins () {
        const json = (args: any[]) => {
            const name = this.requireString(args[0]);
            const fname = this.makeSourceRelativePath(name);
            return JSON.parse(readFileSync(fname, 'utf-8'));
        }
        const range = (args: any[]) => {
            let start = 0;
            let end = undefined;
            if (args.length == 1) {
                end = this.requireNumber(args[0]);
            } else if (args.length == 2) {
                start = this.requireNumber(args[0]);
                end = this.requireNumber(args[1]);
            } else {
                throw new Error(`Invalid number of args to 'range'.  Expecting 1 or 2 arguments.`)
            }
            if (end == start) {
                return [];
            }
            if (end < start) {
                throw new Error(`range 'end' must be larger or equal to 'start'`)
            }
            return Array(end-start).fill(null).map((_,idx) => idx + start);
        };
        const addPlugin = (name: string, handler: any) => {
            this.scopes.declareVar(name, mkEvalValue(handler));
        }
        addPlugin('loadJson', json);
        addPlugin('range', range);
    }

    dumpLabels () {
        return this.scopes.dumpLabels(this.codePC);
    }
}

export function assemble(filename: string) {
    const asm = new Assembler();
    asm.pushSource(filename);

    let pass = 0;
    do {
        asm.startPass(pass);
        asm.registerPlugins();
        asm.assemble(filename, makeCompileLoc(filename));

        if (pass > 0 && asm.anyErrors()) {
            return {
                prg: Buffer.from([]),
                labels: [],
                debugInfo: undefined,
                errors: asm.errors()
            }
        }

        const maxPass = 10;
        if (pass > maxPass) {
            console.error(`Exceeded max pass limit ${maxPass}`);
            return;
        }
        pass += 1;

        if (!asm.needPass && asm.outOfRangeBranches.length != 0) {
            for (let bidx in asm.outOfRangeBranches) {
                const b = asm.outOfRangeBranches[bidx];
                asm.addError(`Branch target too far (must fit in signed 8-bit range, got ${b.offset})`, b.loc);
            }
            break;
        }
    } while(asm.needPass);

    asm.popSource();

    return {
        prg: asm.prg(),
        errors: asm.errors(),
        labels: asm.dumpLabels(),
        debugInfo: asm.debugInfo
    }
}
