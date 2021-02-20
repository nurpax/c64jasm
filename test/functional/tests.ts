
import { assemble } from '../../src/asm'
import { DisasmOptions, disassemble } from '../../src/disasm'
import * as util from '../../src/util';


function rstrip(str: string) {
    return str.replace(/\s+$/g, '');
}

function matchExpectedOutput(expected: string[], actual: string[]): boolean {
    for (let i = 0; i < expected.length; i++) {
        const expLine = expected[i];
        if (actual[i] !== expLine) {
            console.log(`\n\nmismatching line ${i+1}\n\nexpected:  ${expLine}\ngot:       ${actual[i]}`);
            return false;
        }
    }
    return true;
}

function testViceMoncommands(): 'pass'|'fail' {
    const src = `
    lda #0
main: {
    ldx #0
    loop: {
        dex
        bne loop
    }
    !break
    rts
}
`;
    const expectedDisasm = [
        '0801: A9 00        LDA #$00                       ; ',
        '0803: A2 00        LDX #$00                       ; main',
        '0805: CA           DEX                            ; main::loop',
        '0806: D0 FD        BNE $0805                      ; ',
        '0808: 60           RTS                            ; ',
        ''
    ];

    const disasmOptions: DisasmOptions = {
        showLabels: true,
        showCycles: false,
    };

    const { prg, labels, debugInfo } = assemble('main.asm', { readFileSync: () => src })!;
    const disasmLines = disassemble(prg, labels, disasmOptions).concat('');
    if (!matchExpectedOutput(expectedDisasm, disasmLines)) {
        return 'fail';
    }

    const vicemonLines: string[] = [];
    const writeSync = (msg: string) => vicemonLines.push(rstrip(msg));
    util.exportViceMoncommands(writeSync, labels, debugInfo!);
    const expectedVicemon = ['al C:0803 .main', 'al C:0805 .main::loop', 'break 0808'];
    if (!matchExpectedOutput(expectedVicemon, vicemonLines)) {
        return 'fail';
    }
    return 'pass';
}

const tests = [testViceMoncommands];

export { tests };
