
{
  var ast = require('./ast')
  var objectToAst = ast.objectToAst

  const emptyInsn = {
      mnemonic: null,
      imm: null,
      abs: null,
      absx: null,
      absy: null,
      absind: null,
      indx: null,
      indy: null
  }
  function mkinsn(mnemonic, imm, abs, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          imm,
          abs,
          loc
      }
  }
  function mkabsx(mnemonic, absx, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          absx,
          loc
      }
  }
  function mkabsy(mnemonic, absy, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          absy,
          loc
      }
  }

  function mkindx(mnemonic, indx, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          indx,
          loc
      }
  }
  function mkindy(mnemonic, indy, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          indy,
          loc
      }
  }

  function mkabsind(mnemonic, absind, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          absind,
          loc
      }
  }

  function extractList(list, index) {
    return list.map(function(element) { return element[index]; });
  }

  function buildList(head, tail, index) {
    return [head].concat(extractList(tail, index));
  }

  function binop(op, left, right) {
    return {
      type: 'binary',
      op,
      left,
      right
    }
  }

  function loc() {
    return { ...location(), source: options.source }
  }
}

statements =
    head:insnLineWithComment tail:("\n" __ insnLineWithComment)* {
      return buildList(head, tail, 2);
    }

insnLineWithComment =
  insn:insnLine (';' (!'\n' .)*)? {
    return insn
  }

insnLine =
    label:label LWING scopedStmts:statements RWING {
      return ast.mkAsmLine(label, null, scopedStmts, loc());
  }
  / label:label stmt:statement {
      return ast.mkAsmLine(label, stmt, null, loc());
    }
  / label:label {
      return ast.mkAsmLine(label, null, null, loc());
    }
  / stmt:statement {
      return ast.mkAsmLine(null, stmt, null, loc());
    }
  / pc:setPC {
      return ast.mkAsmLine(null, pc, null, loc());
    }
  / __ {
    // empty line is a no-op
    return null
  }

statement =
    directive:directive     { return directive; }
  / instruction:instruction { return ast.mkInsn(instruction, loc()); }

label = lbl:labelIdent ":" __  { return ast.mkLabel(lbl, loc()); }

setPC = STAR EQU pc:expr { return ast.mkSetPC(pc, loc()); }

directive =
    size:(PSEUDO_BYTE / PSEUDO_WORD) values:exprList  {
      const dataSize = size == 'byte' ? ast.DataSize.Byte : ast.DataSize.Word;
      return ast.mkData(dataSize, values, loc());
    }
  / PSEUDO_FILL numBytes:expr COMMA fillValue:expr {
      return ast.mkFill(numBytes, fillValue, loc());
    }
  / PSEUDO_INCLUDE filename:string {
      return ast.mkInclude(filename, loc());
    }
  / PSEUDO_BINARY s:string extra:(COMMA expr? COMMA expr)?  {
      let size = null
      let offset = null
      if (extra !== null) {
        size = extra[1]
        offset = extra[3]
      }
      return ast.mkBinary(filename, size, offset, loc());
    }
  / PSEUDO_IF LPAR condition:expr RPAR  LWING trueBranch:statements
    RWING PSEUDO_ELSE LWING falseBranch:statements RWING {
      return ast.mkIfElse(condition, trueBranch, falseBranch, loc());
    }
  / PSEUDO_IF LPAR condition:expr RPAR LWING trueBranch:statements RWING {
      return ast.mkIfElse(condition, trueBranch, [], loc());
    }
  / PSEUDO_FOR index:labelIdent "in" __ list:expr LWING body:statements RWING {
      return ast.mkFor(ast.mkIdent(index), list, body, loc());
    }
  / PSEUDO_MACRO name:macroName LPAR args:macroArgNameList? RPAR LWING body:statements RWING {
      return ast.mkMacro(name, args, body, loc());
    }
  / "+" name:macroName LPAR args:exprList? RPAR  {
      return ast.mkCallMacro(name, args, loc());
    }
  / name:identifier EQU value:expr  { return ast.mkEqu(name, value, loc()); }

string
  = '"' chars:doubleStringCharacter* '"' __ { return chars.join(''); }

doubleStringCharacter
  = !'"' char:. { return char; }

macroName = name:ident { return ast.mkIdent(name, loc()); }

macroArgNameList = head:macroArgName tail:(COMMA macroArgName)* { return buildList(head, tail, 1); }
macroArgName =
  "~" ident:identifier {
    return ast.mkMacroArg('ref', ident);
  }
  / ident:identifier {
    return ast.mkMacroArg('value', ident);
  }

exprList = head:expr tail:(COMMA expr)* { return buildList(head, tail, 1); }

instruction =
    mnemonic:mnemonic imm:imm  {
      return mkinsn(mnemonic, imm, null, loc());
    }
  / mnemonic:mnemonic LPAR abs:abs COMMA "x" __ RPAR {
      // lda ($zp,x) indirect indexed
      return mkindx(mnemonic, abs, loc());
    }
  / mnemonic:mnemonic LPAR abs:abs RPAR COMMA "y" __ {
      // lda ($zp),y indirect indexed
      return mkindy(mnemonic, abs, loc());
    }
  / mnemonic:mnemonic LPAR abs:abs RPAR {
      // absolute indirect.  only possible form: jmp ($fffc)
      return mkabsind(mnemonic, abs, loc());
    }
  / mnemonic:mnemonic abs:abs COMMA r:("x" / "y") __ {
      if (r === 'x') {
        return mkabsx(mnemonic, abs, loc());
      }
      return mkabsy(mnemonic, abs, loc());
    }
  / mnemonic:mnemonic abs:abs  { return mkinsn(mnemonic, null, abs, loc()); }
  / mnemonic:mnemonic          { return mkinsn(mnemonic, null, null, loc()); }

identNoWS = (alpha+ alphanum*) { return text(); }

labelIdent =
    ident:identNoWS __         { return ident; }
  / ident:("_" identNoWS) __   { return ident.join(''); }

identifier = ident:ident {
  return ast.mkIdent(ident, loc());
}

ident = sym:identNoWS __       { return sym; }
mnemonic = ident:identNoWS __  { return ident; }

imm = '#' lh:loOrHi? expr:expr {
  if (lh !== null) {
    if (lh === 'lo') {
      return binop('&', expr, ast.mkLiteral(255, loc()));
    }
    const lit8 = ast.mkLiteral(8, loc());
    const lit255 = ast.mkLiteral(8, loc());
    return binop('&', binop('>>', expr, lit8), lit255);
  }
  return expr
}

loOrHi =
    LT { return 'lo'; }
  / GT { return 'hi'; }

abs = expr:expr { return expr; }

expr = lastExpr

multiplicative = first:unaryExpression rest:((STAR / DIV / MOD) primary)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }
/ primary

additive = first:multiplicative rest:((PLUS / MINUS) multiplicative)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }

shift = first:additive rest:((LEFT / RIGHT) additive)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }

relational = first:shift rest:((LE / GE / LT / GT) shift)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }

equality = first:relational rest:((EQUEQU / BANGEQU) relational)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }

andExpr = first:equality rest:(AND equality)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }

xorExpr = first:andExpr rest:(HAT andExpr)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }

orExpr = first:xorExpr rest:(OR xorExpr)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }

boolAndExpr = first:orExpr rest:(ANDAND orExpr)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }

boolOrExpr = first:boolAndExpr rest:(OROR boolAndExpr)* {
    return rest.reduce(function(memo, curr) {
      return binop(curr[0], memo, curr[1]);
    }, first);
  }

// TODO cond?a:b
// ConditionalExpression <- LogicalORExpression (QUERY Expression COLON LogicalORExpression)*

lastExpr = boolOrExpr

unaryExpression =
   callExpression
 / head:primary tail:(
      LBRK property:lastExpr RBRK {
        return { property, computed: true };
      }
    / DOT property:labelIdent {
        return { property, computed: false };
      }
  )* {
      return tail.reduce(function(result, element) {
        return {
          type: "member",
          object: result,
          property: element.property,
          computed: element.computed
        };
      }, head);
  }

callExpression =
  ident:labelIdent LPAR args:exprList RPAR {
    return {
      type: 'callfunc',
      name: ident,
      args,
      loc: loc()
    }
  }

primary
  = num:num              { return ast.mkLiteral(num, loc()); }
  / ident:labelIdent     { return ast.mkIdent(ident, loc()); }
  / string:string        { return ast.mkLiteral(string, loc()); }
  / LPAR e:lastExpr RPAR { return e; }

num =
   "$"i hex:$hexdig+ __ { return parseInt(hex, 16); }
 / digs:$digit+      __ { return parseInt(digs, 10); }

alpha = [a-zA-Z_]
alphanum = [a-zA-Z_0-9]

digit  = [0-9]
hexdig = [0-9a-f]

ws "whitespace" = [ \t\r]*
__ = ws

PSEUDO_BYTE    = "!byte" ws { return 'byte'; }
PSEUDO_WORD    = "!word" ws { return 'word'; }
PSEUDO_BINARY  = "!binary" ws
PSEUDO_MACRO   = "!macro" ws
PSEUDO_IF      = "!if" ws
PSEUDO_ELSE    = "else" ws
PSEUDO_FOR     = "!for" ws
PSEUDO_INCLUDE = "!include" ws
PSEUDO_FILL    = "!fill" ws

LBRK      =  s:'['         ws { return s; }
RBRK      =  s:']'         ws { return s; }
LPAR      =  s:'('         ws { return s; }
RPAR      =  s:')'         ws { return s; }
LWING     =  s:'{'         ws { return s; }
RWING     =  s:'}'         ws { return s; }
DOT       =  s:'.'         ws { return s; }
PTR       =  s:'->'        ws { return s; }
INC       =  s:'++'        ws { return s; }
DEC       =  s:'--'        ws { return s; }
AND       =  s:'&'  ![&]   ws { return s; }
STAR      =  s:'*'  ![=]   ws { return s; }
PLUS      =  s:'+'  ![+=]  ws { return s; }
MINUS     =  s:'-'  ![\-=>] ws { return s; }
TILDA     =  s:'~'         ws { return s; }
BANG      =  s:'!'  ![=]   ws { return s; }
DIV       =  s:'/'  ![=]   ws { return s; }
MOD       =  s:'%'  ![=>]  ws { return s; }
LEFT      =  s:'<<' ![=]   ws { return s; }
RIGHT     =  s:'>>' ![=]   ws { return s; }
LT        =  s:'<'  ![=]   ws { return s; }
GT        =  s:'>'  ![=]   ws { return s; }
LE        =  s:'<='        ws { return s; }
GE        =  s:'>='        ws { return s; }
EQUEQU    =  s:'=='        ws { return s; }
BANGEQU   =  s:'!='        ws { return s; }
HAT       =  s:'^'  ![=]   ws { return s; }
OR        =  s:'|'  ![=]   ws { return s; }
ANDAND    =  s:'&&'        ws { return s; }
OROR      =  s:'||'        ws { return s; }
QUERY     =  s:'?'         ws { return s; }
COLON     =  s:':'  ![>]   ws { return s; }
SEMI      =  s:';'         ws { return s; }
ELLIPSIS  =  s:'...'       ws { return s; }
EQU       =  s:'='  !"="   ws { return s; }
STAREQU   =  s:'*='        ws { return s; }
DIVEQU    =  s:'/='        ws { return s; }
MODEQU    =  s:'%='        ws { return s; }
PLUSEQU   =  s:'+='        ws { return s; }
MINUSEQU  =  s:'-='        ws { return s; }
LEFTEQU   =  s:'<<='       ws { return s; }
RIGHTEQU  =  s:'>>='       ws { return s; }
ANDEQU    =  s:'&='        ws { return s; }
HATEQU    =  s:'^='        ws { return s; }
OREQU     =  s:'|='        ws { return s; }
COMMA     =  s:','         ws { return s; }

EOT       =  !.
