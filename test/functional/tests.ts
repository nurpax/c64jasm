
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

    const { prg, labels, debugInfo } = assemble('main.asm', { readFileSync: () => src })!;

    const disasmOptions: DisasmOptions = {
        showLabels: true,
        showCycles: false
    };

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

function runC64debuggerDbgTest(src: string, expectedDbg: string): 'pass'|'fail' {
    const { prg, labels, segments, debugInfo, errors } = assemble('main.asm', { readFileSync: () => src })!;
    if (errors.length !== 0) {
        console.log(errors);
        return 'fail';
    }

    const disasmOptions: DisasmOptions = {
        showLabels: true,
        showCycles: false,
        isInstruction: debugInfo!.info().isInstruction
    };
    const disasmLines = disassemble(prg, labels, disasmOptions).concat('');
    //console.log();
    //console.log(disasmLines.join('\n'));

    const debugLines: string[] = [];
    const writeSync = (msg: string) => debugLines.push(rstrip(msg));
    util.exportC64debuggerInfo(writeSync, labels, segments, debugInfo!);
    //console.log(debugLines.join('\n'));
    if (!matchExpectedOutput(debugLines, expectedDbg.split('\n'))) {
        return 'fail';
    }

    return 'pass';
}

function testC64debugger_simplest() {
    const src =
`!macro m1() {   ; line 1
    lda #1       ; line 2
    lda #2       ; line 3
    !break       ; line 4
}                ; line 5
!macro m2() {    ; line 6
    lda #0       ; line 7
    +m1()        ; line 8
    lda #3       ; line 9
}                ; line 10
    +m2()        ; line 11
    +m1()        ; line 12
    rts          ; line 13
`;
const expectedDbg = `<C64debugger version="1.0">
  <Sources values="INDEX,FILE">
    0,/home/janne/dev/c64jasm/main.asm
  </Sources>
  <Segment name="default" values="START,END,FILE_IDX,LINE1,COL1,LINE2,COL2">
    <Block>
      $0801,$0802,0,7,1,7,1
      $0803,$0804,0,2,1,2,1
      $0805,$0806,0,3,1,3,1
      $0807,$0808,0,9,1,9,1
      $0809,$080a,0,2,1,2,1
      $080b,$080c,0,3,1,3,1
      $080d,$080d,0,13,1,13,1
    </Block>
  </Segment>
  <Labels values="SEGMENT,ADDRESS,NAME">
  </Labels>
  <Breakpoints values="SEGMENT,ADDRESS,ARGUMENT">
    default,$0807,
    default,$080d,
  </Breakpoints>
</C64debugger>`;
    return runC64debuggerDbgTest(src, expectedDbg);
}

function testC64debugger_segments() {
    const src =
`!segment code(start=$800, end=$805)  ; line 1
!segment data(start=$810, end=$813)  ; line 2
!segment code                        ; line 3
    lda #0                           ; line 4
!segment data                        ; line 5
!byte 0,1,2,3                        ; line 6
!segment code                        ; line 7
    lda #1                           ; line 8
    rts                              ; line 9
`;
const expectedDbg = `<C64debugger version="1.0">
  <Sources values="INDEX,FILE">
    0,/home/janne/dev/c64jasm/main.asm
  </Sources>
  <Segment name="code" values="START,END,FILE_IDX,LINE1,COL1,LINE2,COL2">
    <Block>
      $0800,$0801,0,4,1,4,1
      $0802,$0803,0,8,1,8,1
      $0804,$0804,0,9,1,9,1
    </Block>
  </Segment>
  <Segment name="data" values="START,END,FILE_IDX,LINE1,COL1,LINE2,COL2">
    <Block>
      $0810,$0813,0,6,1,6,1
    </Block>
  </Segment>
  <Labels values="SEGMENT,ADDRESS,NAME">
  </Labels>
  <Breakpoints values="SEGMENT,ADDRESS,ARGUMENT">
  </Breakpoints>
</C64debugger>`;
    return runC64debuggerDbgTest(src, expectedDbg);
}

const tests = [testViceMoncommands, testC64debugger_simplest, testC64debugger_segments];

export { tests };
