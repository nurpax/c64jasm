
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
    ws label:label ws instruction:instruction {
        return {label:label, insn:instruction};
    }
  / ws label:label ws {
        return { label:label, insn:null };
    }
  / ws instruction:instruction ws {
        return {label:null, insn:instruction};
    }

label = ident:ident ":" { return ident; }

instruction =
    ws mnemonic:mnemonic ws imm:imm ws  { return mkinsn(mnemonic, imm, null); }
  / ws mnemonic:mnemonic ws abs:abs ws  { return mkinsn(mnemonic, null, abs); }
  / ws mnemonic:mnemonic ws             { return mkinsn(mnemonic, null, null); }

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
