
export interface Loc {
  offset: number,
  line: number,
  column: number
}

export interface SourceLoc {
  start: Loc,
  end: Loc,
  source: string
}

export interface Node {
  loc: SourceLoc;
}

export interface Label extends Node {
  name: string;
}

export interface Literal extends Node {
  type: 'literal',
  lit: number | string
  unresolved: Label | Ident | null;
}

export interface Ident extends Node {
  type: 'ident';
  name: string;
}

export interface Unary extends Node {
  type: 'unary';
  op: string;
  expr: Expr;
}

export function mkLiteral(lit: number | string, loc: SourceLoc, unresolved = null): Literal {
  return { type: 'literal', lit, loc, unresolved };
}

export function mkIdent(name: string, loc: SourceLoc): Ident {
  return { type: 'ident', name, loc };
}

export function mkUnary(op: string, expr: Expr, loc: SourceLoc): Expr {
  return { type: 'unary', op, expr, loc };
}

export enum DataSize { Byte, Word };

export type Expr = any | Ident | Literal | Unary
export type Stmt =
    StmtInsn
  | StmtSetPC
  | StmtAlign
  | StmtData
  | StmtFill
  | StmtInclude
  | StmtBinary
  | StmtIfElse
  | StmtError
  | StmtFor
  | StmtMacro
  | StmtCallMacro
  | StmtCallFunc
  | StmtLet
  | StmtAssign
  | StmtLoadPlugin

export type Insn = any

export interface StmtInsn extends Node {
  type: 'insn';
  insn: Insn;
}

export interface StmtSetPC extends Node {
  type: 'setpc';
  pc: Expr;
}

export interface StmtData extends Node {
  type: 'data';
  dataSize: DataSize;
  values: Expr[];
}

export interface StmtFill extends Node {
  type: 'fill';
  numBytes: number;
  fillValue: Expr;
}

export interface StmtAlign extends Node {
  type: 'align';
  alignBytes: Expr;
}

export interface StmtInclude extends Node {
  type: 'include';
  filename: string;
}

export interface StmtBinary extends Node {
  type: 'binary';
  filename: string;
  size: Expr;
  offset: Expr;
}

export interface StmtIfElse extends Node {
  type: 'if';
  cases: [Expr, AsmLine[]];
  elseBranch: AsmLine[];
}

export interface StmtError extends Node {
  type: 'error';
  error: string;
}

export interface StmtFor extends Node {
  type: 'for',
  index: Ident;
  list: Expr;
  body: AsmLine[];
}

export interface MacroArg {
  ident: Ident;
}

export interface StmtMacro extends Node {
  type: 'macro',
  name: Ident;
  args: MacroArg[];
  body: AsmLine[];
}

export interface StmtCallMacro extends Node {
  type: 'callmacro',
  name: Ident;
  args: Expr[];
}

export interface StmtCallFunc extends Node {
  type: 'callfunc',
  name: Ident;
  args: Expr[];
}

export interface StmtLet extends Node {
  type: 'let',
  name: Ident;
  value: Expr;
}

export interface StmtAssign extends Node {
  type: 'assign',
  name: Ident;
  value: Expr;
}

export interface StmtLoadPlugin extends Node {
  type: 'load-plugin',
  filename: string;
  moduleName: Ident;
}

export interface AsmLine extends Node {
  label: Label | null;
  stmt: Stmt | null;
  scopedStmts: AsmLine[] | null;
}

export function mkLabel(name: string, loc: SourceLoc): Label {
  return { name, loc };
}

export function mkInsn(insn: Insn, loc: SourceLoc): StmtInsn {
  return {
    type: 'insn',
    insn,
    loc
  }
}

export function mkSetPC(pc: Expr, loc: SourceLoc): StmtSetPC {
  return {
    type: 'setpc',
    pc,
    loc
  }
}

export function mkData(dataSize: DataSize, values: Expr[], loc: SourceLoc): StmtData {
  return {
    type: 'data',
    values,
    dataSize,
    loc
  }
}

export function mkFill(numBytes: number, fillValue: Expr, loc: SourceLoc): StmtFill {
  return { type: 'fill', numBytes, fillValue, loc }
}

export function mkAlign(alignBytes: Expr, loc: SourceLoc): StmtAlign {
  return { type: 'align', alignBytes, loc }
}

export function mkInclude(filename: string, loc: SourceLoc): StmtInclude {
  return {
    type: 'include',
    filename,
    loc
  }
}

export function mkError(error: string, loc: SourceLoc): StmtError {
  return {
    type: 'error',
    error,
    loc
  }
}

export function mkBinary(filename: Expr, size: Expr, offset: Expr, loc: SourceLoc): StmtBinary {
  return {
    type: 'binary',
    filename,
    size,
    offset,
    loc
  }
}

export function mkIfElse(cases: [Expr, AsmLine[]], elseBranch: AsmLine[], loc: SourceLoc): StmtIfElse {
  return {
    type: 'if',
    cases,
    elseBranch: elseBranch !== null ? elseBranch : [],
    loc
  }
}

export function mkFor(index: Ident, list: Expr, body: AsmLine[], loc: SourceLoc): StmtFor {
  return {
    type: 'for',
    index,
    list,
    body,
    loc
  }
}

export function mkMacroArg(ident: Ident): MacroArg {
  return { ident };
}

export function mkMacro(name: Ident, args: MacroArg[] | null, body: AsmLine[], loc: SourceLoc): StmtMacro {
  return {
    type: 'macro',
    name,
    args: args == null ? [] : args,
    body,
    loc
  }
}

export function mkCallMacro(name: Ident, args: Expr[], loc: SourceLoc): StmtCallMacro {
  return {
    type: 'callmacro',
    name,
    args: args == null ? [] : args,
    loc
  }
}

export function mkCallFunc(name: Ident, args: Expr[], loc: SourceLoc): StmtCallFunc {
  return {
    type: 'callfunc',
    name,
    args: args == null ? [] : args,
    loc
  }
}

export function mkLet(name: Ident, value: Expr, loc: SourceLoc): StmtLet {
  return {
    type: 'let',
    name,
    value,
    loc
  }
}

export function mkAssign(name: Ident, value: Expr, loc: SourceLoc): StmtAssign {
  return {
    type: 'assign',
    name,
    value,
    loc
  }
}

export function mkLoadPlugin(filename: string, moduleName: Ident, loc: SourceLoc): StmtLoadPlugin {
  return {
    type: 'load-plugin',
    filename,
    moduleName,
    loc
  }
}

export function mkAsmLine(
    label: Label = null,
    stmt: Stmt = null,
    scopedStmts: AsmLine[] = null,
    loc: SourceLoc
  ): AsmLine {
  return { label, stmt, scopedStmts, loc };
}

// Convert a Javascript object to AST nodes
export function objectToAst(o, loc) {
    if (Array.isArray(o)) {
      return {
        type: 'array',
        values: o.map(e => objectToAst(e, loc)),
        loc
      }
    }
    if (typeof o === 'object') {
      return {
        type: 'object',
        props: Object.keys(o).map(k => {
          return { key: k, val: objectToAst(o[k], loc) };
        }),
        loc
      }
    }
    if (typeof o === 'number') {
      return mkLiteral(o, loc);
    }
    if (typeof o === 'string') {
      return mkLiteral(o, loc);
    }
    return undefined;
}
