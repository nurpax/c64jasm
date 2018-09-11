
{
  const emptyInsn = {
      mnemonic: null,
      imm: null,
      abs: null,
      absx: null,
      absy: null,
      absind: null
  }
  function mkinsn(mnemonic, imm, abs) {
      return {
          ...emptyInsn,
          mnemonic,
          imm,
          abs
      }
  }
  function mkabsx(mnemonic, absx) {
      return {
          ...emptyInsn,
          mnemonic,
          absx
      }
  }
  function mkabsy(mnemonic, absy) {
      return {
          ...emptyInsn,
          mnemonic,
          absy
      }
  }
  function mkabsind(mnemonic, absind) {
      return {
          ...emptyInsn,
          mnemonic,
          absind
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

  function iconst(value) {
    return {
      type: 'literal',
      value
    }
  }
}

statements =
    head:insnLine tail:("\n" __ insnLine)* {
      return buildList(head, tail, 2);
    }

insnLine =
    label:label stmt:statement {
      return { label:label, stmt };
    }
  / label:label {
      return { label:label, stmt:null };
    }
  / stmt:statement {
      return { label:null, stmt };
    }
  / pc:setPC {
      return { label: null, stmt:pc }
    }
  / __ {
    // empty line is a no-op
    return null
  }

statement =
    instruction:instruction {
      return {
        type: 'insn',
        insn: instruction
      }
    }
  / directive:directive { return directive; }

label = ident:identNoWS ":" __ { return ident; }

setPC =
  STAR EQU pc:expr {
    return {
      type: 'setpc',
      pc
    };
  }

directive =
    PSEUDO_BYTE values:exprList  {
      return {
        type: 'byte',
        values
      };
    }
  / PSEUDO_WORD values:exprList {
      return {
        type: 'word',
        values: values
      };
    }
  / PSEUDO_BINARY s:string extra:(COMMA expr? COMMA expr)?  {
      let size = null
      let offset = null
      if (extra !== null) {
        size = extra[1]
        offset = extra[3]
      }
      return {
        type: 'binary',
        filename: s,
        size,
        offset
      };
    }
  / PSEUDO_IF LPAR condition:expr RPAR  LWING trueBranch:statements
    RWING PSEUDO_ELSE LWING falseBranch:statements RWING {
      return {
        type: 'if',
        cond:condition,
        trueBranch,
        falseBranch:falseBranch
      };
    }
  / PSEUDO_IF LPAR condition:expr RPAR LWING trueBranch:statements RWING {
      return {
        type: 'if',
        cond:condition,
        trueBranch,
        falseBranch:null
      };
    }
  / PSEUDO_MACRO name:ident LPAR args:macroArgNameList RPAR LWING body:statements RWING {
      return {
        type: 'macro',
        name,
        args,
        body
      };
    }
  / "+" name:ident LPAR args:macroArgValueList RPAR  {
      return {
        type: 'callmacro',
        name,
        args
      };
    }

string
  = '"' chars:doubleStringCharacter* '"' __ { return chars.join(''); }

doubleStringCharacter
  = !'"' char:. { return char; }

macroArgNameList = head:macroArgName tail:(COMMA macroArgName)* { return buildList(head, tail, 1); }
macroArgName =
  "~" name:ident {
    return {
      type: 'ref',
      name
    };
  }
  / name:ident {
    return {
      type: 'value',
      name
    };
  }

macroArgValueList = exprList

exprList = head:expr tail:(COMMA expr)* { return buildList(head, tail, 1); }

instruction =
    mnemonic:mnemonic imm:imm  {
      return mkinsn(mnemonic, imm, null);
    }
  / mnemonic:mnemonic  LPAR abs:abs RPAR {
      // absolute indirect.  only possible form: jmp ($fffc)
      return mkabsind(mnemonic, abs);
    }
  / mnemonic:mnemonic abs:abs COMMA r:("x" / "y") __ {
      if (r === 'x') {
        return mkabsx(mnemonic, abs);
      }
      return mkabsy(mnemonic, abs);
    }
  / mnemonic:mnemonic abs:abs  { return mkinsn(mnemonic, null, abs); }
  / mnemonic:mnemonic          { return mkinsn(mnemonic, null, null); }

identNoWS = (alpha+ alphanum*) { return text(); }

ident = sym:identNoWS __   { return sym; }
mnemonic = ident:ident     { return ident; }

imm = '#' lh:loOrHi? expr:expr {
  if (lh !== null) {
    if (lh === 'lo') {
      return binop('&', expr, iconst(255))
    }
    return binop('&', binop('>>', expr, iconst(8)), iconst(255));
  }
  return expr
}

loOrHi =
    LT { return 'lo'; }
  / GT { return 'hi'; }

abs = expr:expr { return expr; }

expr = lastExpr

multiplicative = first:primary rest:((STAR / DIV / MOD) primary)* {
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


primary
  = num:num      { return iconst(num); }
  / ident:ident  { return { type: 'ident', name: ident } }
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

PSEUDO_BYTE   = "!byte" ws
PSEUDO_WORD   = "!word" ws
PSEUDO_BINARY = "!binary" ws
PSEUDO_MACRO = "!macro" ws
PSEUDO_IF     = "!if" ws
PSEUDO_ELSE   = "else" ws

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
