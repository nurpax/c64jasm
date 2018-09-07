
{
  function mkinsn(mnemonic, imm, abs) {
      return {
          mnemonic,
          imm,
          abs
      }
  }
}

insnLine =
    __ label:label __ instruction:instruction __ {
        return { label:label, insn:instruction };
    }
  / __ label:label __ {
        return { label:label, insn:null };
    }
  / __ instruction:instruction __ {
        return { label:null, insn:instruction };
    }

label = ident:ident ":" { return ident; }

instruction =
    mnemonic:mnemonic __ imm:imm  { return mkinsn(mnemonic, imm, null); }
  / mnemonic:mnemonic __ abs:abs  { return mkinsn(mnemonic, null, abs); }
  / mnemonic:mnemonic             { return mkinsn(mnemonic, null, null); }

ident = (alpha+ alphanum*)  { return text(); }
mnemonic = ident:ident      { return ident; }

imm = '#' expr:expr { return expr; }

abs = expr:expr { return expr; }

expr = additive

additive = first:multiplicative rest:(__ ('+' / '-') __ multiplicative)+ {
    return rest.reduce(function(memo, curr) {
      return {type: 'binary', op: curr[1], left: memo, right: curr[3]};
    }, first);
}
/ multiplicative

multiplicative = first:primary rest:(__ ('*' / '/' / '%') __ primary)+ {
    return rest.reduce(function(memo, curr) {
      return {type: 'binary', op: curr[1], left: memo, right: curr[3]};
    }, first);
}
/ primary

primary
  = num:num      { return { type: 'literal', value: num }}
  / ident:ident  { return { type: 'ident', name: ident } }
  / "(" __ additive:additive __ ")" { return additive; }


num =
   "$"i hex:$hexdig+ { return parseInt(hex, 16); }
 / digs:$digit+      { return parseInt(digs, 10); }

alpha = [a-zA-Z_]
alphanum = [a-zA-Z_0-9]

digit  = [0-9]
hexdig = [0-9a-f]

ws "whitespace" = [ \t\n\r]*
__ = ws
