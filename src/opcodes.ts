

const CROSS_PAGE   = 1<<14;
const BRANCH_TAKEN = 1<<15;

function o__(op: number, c: number): number {
    return op | (c << 8);
}

// op + cross page adds one cycle
function oc_(op: number, c: number): number {
    return op | (c << 8) | CROSS_PAGE;
}

// op + cross page adds one cycle + branch taken adds one cycle
function ocb(op: number, c: number): number {
    return op | (c << 8) | CROSS_PAGE | BRANCH_TAKEN;
}

// this stolen from here: https://github.com/skilldrick/6502js/blob/master/assembler.js
const opcodes: {[index: string]: (number | null)[]} = {
  /* Name,Imm,          ZP,          ZPX,          ZPY,           ABS,         ABSX,        ABSY,        IND,         INDX,         INDY,        SNGL,        BRA */
  'ADC': [ o__(0x69,2), o__(0x65,3), o__(0x75,4),  null,          o__(0x6d,4), oc_(0x7d,4), oc_(0x79,4), null,        o__(0x61,6),  oc_(0x71,5), null,        null],
  'AND': [ o__(0x29,2), o__(0x25,3), o__(0x35,4),  null,          o__(0x2d,4), oc_(0x3d,4), oc_(0x39,4), null,        o__(0x21,6),  oc_(0x31,5), null,        null],
  'ASL': [null,         o__(0x06,5), o__(0x16,6),  null,          o__(0x0e,6), o__(0x1e,7), null,        null,        null,         null,        o__(0x0a,2), null],
  'BIT': [null,         o__(0x24,3), null,         null,          o__(0x2c,4), null,        null,        null,        null,         null,        null,        null],
  'BPL': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        null,        ocb(0x10,2)],
  'BMI': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        null,        ocb(0x30,2)],
  'BVC': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        null,        ocb(0x50,2)],
  'BVS': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        null,        ocb(0x70,2)],
  'BCC': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        null,        ocb(0x90,2)],
  'BCS': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        null,        ocb(0xb0,2)],
  'BNE': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        null,        ocb(0xd0,2)],
  'BEQ': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        null,        ocb(0xf0,2)],
  'BRK': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x00,7), null],
  'CMP': [ o__(0xc9,2), o__(0xc5,3), o__(0xd5,4),  null,          o__(0xcd,4), oc_(0xdd,4), oc_(0xd9,4), null,        o__(0xc1,6),  oc_(0xd1,5), null,        null],
  'CPX': [ o__(0xe0,2), o__(0xe4,3), null,         null,          o__(0xec,4), null,        null,        null,        null,         null,        null,        null],
  'CPY': [ o__(0xc0,2), o__(0xc4,3), null,         null,          o__(0xcc,4), null,        null,        null,        null,         null,        null,        null],
  'DEC': [null,         o__(0xc6,5), o__(0xd6,6),  null,          o__(0xce,6), o__(0xde,7), null,        null,        null,         null,        null,        null],
  'EOR': [ o__(0x49,2), o__(0x45,3), o__(0x55,4),  null,          o__(0x4d,4), oc_(0x5d,4), oc_(0x59,4), null,        o__(0x41,6),  oc_(0x51,5), null,        null],
  'CLC': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x18,2), null],
  'SEC': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x38,2), null],
  'CLI': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x58,2), null],
  'SEI': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x78,2), null],
  'CLV': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xb8,2), null],
  'CLD': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xd8,2), null],
  'SED': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xf8,2), null],
  'INC': [null,         o__(0xe6,5), o__(0xf6,6),  null,          o__(0xee,6), o__(0xfe,7), null,        null,        null,         null,        null,        null],
  'JMP': [null,         null,        null,         null,          o__(0x4c,3), null,        null,        o__(0x6c,5), null,         null,        null,        null],
  'JSR': [null,         null,        null,         null,          o__(0x20,6), null,        null,        null,        null,         null,        null,        null],
  'LDA': [o__(0xa9,2),  o__(0xa5,3), o__(0xb5,4),  null,          o__(0xad,4), oc_(0xbd,4), oc_(0xb9,4), null,        o__(0xa1,6),  oc_(0xb1,5), null,        null],
  'LDX': [o__(0xa2,2),  o__(0xa6,3), null,         o__(0xb6,4),   o__(0xae,4), null,        oc_(0xbe,4), null,        null,         null,        null,        null],
  'LDY': [o__(0xa0,2),  o__(0xa4,3), o__(0xb4,4),  null,          o__(0xac,4), oc_(0xbc,4), null,        null,        null,         null,        null,        null],
  'LSR': [null,         o__(0x46,5), o__(0x56,6),  null,          o__(0x4e,6), o__(0x5e,7), null,        null,        null,         null,        o__(0x4a,2), null],
  'NOP': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xea,2), null],
  'ORA': [o__(0x09,2),  o__(0x05,3), o__(0x15,4),  null,          o__(0x0d,4), oc_(0x1d,4), oc_(0x19,4), null,        o__(0x01,6),  oc_(0x11,5), null,        null],
  'TAX': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xaa,2), null],
  'TXA': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x8a,2), null],
  'DEX': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xca,2), null],
  'INX': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xe8,2), null],
  'TAY': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xa8,2), null],
  'TYA': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x98,2), null],
  'DEY': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x88,2), null],
  'INY': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xc8,2), null],
  'ROR': [null,         o__(0x66,5), o__(0x76,6),  null,          o__(0x6e,6), o__(0x7e,7), null,        null,        null,         null,        o__(0x6a,2), null],
  'ROL': [null,         o__(0x26,5), o__(0x36,6),  null,          o__(0x2e,6), o__(0x3e,7), null,        null,        null,         null,        o__(0x2a,2), null],
  'RTI': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x40,6), null],
  'RTS': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x60,6), null],
  'SBC': [o__(0xe9,2),  o__(0xe5,3), o__(0xf5,4),  null,          o__(0xed,4), oc_(0xfd,4), oc_(0xf9,4), null,        o__(0xe1,6),  oc_(0xf1,5), null,        null],
  'STA': [null,         o__(0x85,3), o__(0x95,4),  null,          o__(0x8d,4), oc_(0x9d,4), oc_(0x99,4), null,        o__(0x81,6),  oc_(0x91,5), null,        null],
  'TXS': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x9a,2), null],
  'TSX': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0xba,2), null],
  'PHA': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x48,3), null],
  'PLA': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x68,4), null],
  'PHP': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x08,3), null],
  'PLP': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        o__(0x28,4), null],
  'STX': [null,         o__(0x86,3), null,         o__(0x96,4),   o__(0x8e,4), null,        null,        null,        null,         null,        null,        null],
  'STY': [null,         o__(0x84,3), o__(0x94,4),  null,          o__(0x8c,4), null,        null,        null,        null,         null,        null,        null],
  '---': [null,         null,        null,         null,          null,        null,        null,        null,        null,         null,        null,        null]
};

export default opcodes;
