
import { readFileSync } from 'fs';
import { EventEmitter } from 'events';

import { ChildProcess } from 'child_process'
import * as child_process from 'child_process'
import * as net from 'net';
import { StackFrame, Source } from 'vscode-debugadapter';

export interface C64jasmBreakpoint {
    id: number;
    line: number;
    verified: boolean;
}

type Cmd = 'next' | 'step' | 'pause' | undefined;
class MonitorConnection extends EventEmitter {
    private client: net.Socket;
    private echo: (str: string) => void;
    private prevCommand: Cmd;

    constructor(echo: (str: string) => void) {
        super();
        this.echo = echo;
    }

    connect() {
        this.client = net.createConnection({ port: 6510, timeout:5000 }, () => {
            console.log('Connected to VICE monitor');
        });

        this.client.on('data', data => {
            const lines = data.toString().split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                this.echo(line);
                const breakRe = /^#([0-9]+) \(Stop on\s+exec ([0-9a-f]+)\).*/;
                let match = line.match(breakRe);
                if (match) {
                    const addr = parseInt(match[2], 16);
                    this.emit('break', addr);
                    continue;
                }
                // const breakRe2 = /^.*BREAK: ([0-9]+)\s+C:\$([0-9a-f]+)\s+.*/;
                // match = line.match(breakRe2);
                // if (match) {
                //     const addr = parseInt(match[2], 16);
                //     this.emit('break', addr);
                //     continue;
                // }

                if (this.prevCommand == 'next' || this.prevCommand == 'step') {
                    const stepRe = /^\.C:([0-9a-f]+)\s+.*/;
                    match = line.match(stepRe);
                    if (match) {
                        const addr = parseInt(match[1], 16);
                        // TODO this should be next/step/stop not break maybe?
                        this.emit('stopOnStep', addr);
                        this.prevCommand = undefined;
                        continue;
                    }
                }

                if (this.prevCommand == 'pause') {
                    const curAddrRe = /^\(C:\$([0-9a-f]+)\)\s+.*/;
                    match = line.match(curAddrRe);
                    if (match) {
                        const addr = parseInt(match[1], 16);
                        // TODO this should be next/step/stop not break maybe?
                        this.emit('stopOnStep', addr);
                        this.prevCommand = undefined;
                        continue;
                    }
                }

                // registers:
                //  ADDR A  X  Y  SP 00 01 NV-BDIZC LIN CYC  STOPWATCH
                //.;080d 00 00 0a f3 2f 37 00100010 000 002    4147418

                const regsRe = /^  ADDR A  X  Y  SP 00 01 NV-BDIZC LIN CYC  STOPWATCH/;
                const valsRe = /.;([0-9a-f]+) ([0-9a-f]+) ([0-9a-f]+) ([0-9a-f]+) ([0-9a-f]+) ([0-9a-f]+) ([0-9a-f]+) ([01])+ ([0-9]+) ([0-9]+)\s+([0-9]+)/
                if (line.match(regsRe)) {
                    i++;
                    if (i < lines.length) {
                        const line = lines[i];
                        this.echo(line);
                        const m = line.match(valsRe);
                        if (m) {
                            const vals = {
                                addr: parseInt(m[1], 16),
                                a: parseInt(m[2], 16),
                                x: parseInt(m[3], 16),
                                y: parseInt(m[4], 16),
                                sp: parseInt(m[5], 16),
                                v00: parseInt(m[6], 16),
                                v01: parseInt(m[7], 16),
                                flags: parseInt(m[8], 2),
                                line: parseInt(m[9], 10),
                                cycle: parseInt(m[10], 10),
                                stopwatch: parseInt(m[11], 10),
                            }
                            this.emit('registers', vals);
                        }
                    }
                }

            }
        });
    }

    setBreakpoint(pc: number): Promise<void> {
        return new Promise(resolve => {
            const cmd = `break ${pc.toString(16)}\n`;
            this.prevCommand = undefined;
            this.client.write(cmd, () => resolve());
        })
    }

    delBreakpoints(): Promise<void> {
        return new Promise(resolve => {
            this.prevCommand = undefined;
            this.client.write('del\n', () => resolve());
        })
    }

    go(pc?: number): Promise<void> {
        return new Promise(resolve => {
            const cmd = pc === undefined ?
                'g' : `g ${pc.toString(16)}`;
            this.prevCommand = undefined;
            this.client.write(cmd+'\n', () => resolve());
        });
    }

    next(): Promise<void> {
        return new Promise(resolve => {
            this.prevCommand = 'next';
            this.client.write('next'+'\n', () => resolve());
        });
    }

    step(): Promise<void> {
        return new Promise(resolve => {
            this.prevCommand = 'step';
            this.client.write('step'+'\n', () => resolve());
        });
    }

    pause(): Promise<void> {
        return new Promise(resolve => {
            this.prevCommand = 'pause';
            this.client.write('\n', () => resolve());
        });
    }

    disass(pc?: number): Promise<void> {
        return new Promise(resolve => {
            const cmd = pc === undefined ?
                'disass' : `disass ${pc.toString(16)}`;
            this.prevCommand = undefined;
            this.client.write(cmd+'\n', () => resolve());
        })
    }

    rawCommand(cmd: string): Promise<void> {
        return new Promise(resolve => {
            this.prevCommand = undefined;
            this.client.write(cmd+'\n', () => resolve());
        })
    }

    loadProgram(prgName: string, startAddress: number): Promise<void> {
        return new Promise(resolve => {
            this.prevCommand = 'step'; // parse next output to mean we've stopped at that address
            const addrHex = startAddress.toString(16);
            this.client.write(`l "${prgName}" 0 801\nbreak ${addrHex}\ngoto ${addrHex}\n`, () => resolve());
        })
    }
}

type C64jasmDebugInfo = {
    outputPrg: string;
    debugInfo: {
        pcToLocs: {
            [pc: string]: {
                lineNo: number, source: string
            }[];
        }
    }
};

function queryC64jasmDebugInfo(): Promise<C64jasmDebugInfo> {
    return new Promise((resolve) => {
        const port = 6502;

        const client = net.createConnection({ port, timeout:5000 }, () => {
            console.log('Connected to c64jasm');
            client.write('debug-info\r\n');
        })

        const chunks: Buffer[] = [];
        client.on('data', data => {
            chunks.push(data);
        }).on('end', () => {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
        });
    });
}

// This is a super expensive function but at least for now,
// it's only ever run when setting a breakpoint from the UI.
function findSourceLoc (c64jasm: C64jasmDebugInfo|null, path: string, line: number): number|undefined {
    if (c64jasm) {
        const pclocs = c64jasm.debugInfo.pcToLocs;
        for (const pc of Object.keys(pclocs)) {
            const locList = pclocs[pc];
            for (let i = 0; i < locList.length; i++) {
                const loc = locList[i];
                if (loc.source == path && loc.lineNo == line) {
                    return parseInt(pc, 10);
                }
            }
        }
    }
    return null;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse .prg BASIC start header.  This matches with what c64jasm
// authored prgs output.  We use this for setting an initial breakpoint
// for the program entry point.
function parseBasicSysAddress(progName: string): number {
    const buf = readFileSync(progName);
//    00000000: 0108 0c08 0000 9e32 3036 3100 0000 a900  .......2061.....

    if (buf[0] == 0x01 && buf[1] == 0x08 && buf[2] == 0x0c && buf[3] == 0x08 && 
        buf[4] == 0x00 && buf[5] == 0x00 && buf[6] == 0x9e) {
        let offs = 7;
        let addr = 0;
        while(buf[offs] != 0) {
            addr *= 10;
            addr += buf[offs] - 0x30;
            offs++;
        }
        return addr;
    }
    throw new Error('couldn\'t parse entry point address');
}

/**
 * A C64jasm runtime with minimal debugger functionality.
 */
export class C64jasmRuntime extends EventEmitter {

    // CPU address when last breakpoint was hit
    private _stoppedAddr = 0;

    // maps from sourceFile to array of C64jasm breakpoints
    private _breakPoints = new Map<string, C64jasmBreakpoint[]>();

    // since we want to send breakpoint events, we will assign an id to every event
    // so that the frontend can match events with breakpoints.
    private _breakpointId = 1;

    private _viceProcess: ChildProcess = null;
    private _monitor: MonitorConnection;
    private _debugInfo: C64jasmDebugInfo = null;

    constructor() {
        super();
    }

    /**
     * Start executing the given program.
     */
    public async start(program: string, stopOnEntry: boolean) {
        // Ask c64jasm compiler for debug information.  This is done
        // by connecting to a running c64jasm process that's watching
        // source files for changes.
        this._debugInfo = await queryC64jasmDebugInfo();
        const startAddress = parseBasicSysAddress(program);
         //# this doesn't work with vscode as it breaks into VICE monitor, not remote monitor
        this._viceProcess = child_process.exec(`x64 -remotemonitor`);
        await sleep(6000);

        const echoLog = (logMsg: string) => {
            this.sendEvent('output', logMsg);
        }
        this._monitor = new MonitorConnection(echoLog);
        // Handle stop on breakpoint
        this._monitor.on('break', breakAddr => {
            this._stoppedAddr = breakAddr;
            this.sendEvent('stopOnBreakpoint');
        });
        this._monitor.on('stopOnStep', breakAddr => {
            this._stoppedAddr = breakAddr;
            this.sendEvent('stopOnStep');
        });
        this._monitor.connect();
        this._monitor.loadProgram(program, startAddress);
        // Stop the debugger once the VICE process exits.
        this._viceProcess.on('close', (code, signal) => {
            this.sendEvent('end');
        })

        // TODO figure out a way to support stopOnEntry using
        // vice commands here.
    }

    public terminate() {
        this._viceProcess.kill();
    }

    /**
     * Continue execution.
     */
    public continue() {
        this._monitor.go();
    }

    public step() {
        this._monitor.step();
    }

    public next() {
        this._monitor.next();
    }

    public pause() {
        this._monitor.pause();
    }

    private findSourceLineByAddr(addr: number) {
        // TODO [0] is wrong, single addr may have more than one?? no?
        const info = this._debugInfo.debugInfo.pcToLocs[addr][0];
        if (info) {
            return {
                src: new Source('test1', info.source),
                line: info.lineNo
            }
        }
        return undefined;
    }

    /**
     * Returns a stack trace for the addres where we're currently stopped at.
     */
    public stack(): StackFrame|undefined {
        if (this._debugInfo && this._debugInfo.debugInfo) {
            const { src, line } = this.findSourceLineByAddr(this._stoppedAddr);
            return new StackFrame(1, src.name, src, line);
        }
        return undefined;
    }

    /*
     * Set breakpoint in file with given line.
     */
    public async setBreakPoint(path: string, line: number): Promise<C64jasmBreakpoint> {
        const bp = <C64jasmBreakpoint> { verified: false, line, id: this._breakpointId++ };
        let bps = this._breakPoints.get(path);
        if (!bps) {
            bps = new Array<C64jasmBreakpoint>();
            this._breakPoints.set(path, bps);
        }
        bps.push(bp);
        await this.verifyBreakpoints(path);
        return bp;
    }

    /*
     * Clear all breakpoints for file.
     */
    public async clearBreakpoints(path: string) {
        // TODO this deletes all VICE monitor breakpoints.
        // Should keep track of set BPs instead and delete the
        // ones that are set for this file.
        await this._monitor.delBreakpoints();
        this._breakPoints.delete(path);
    }

    // Disassemble from current PC
    public disass(pc?: number): void {
        this._monitor.disass(pc);
    }

    // Disassemble from current PC
    public rawCommand(c: string): void {
        this._monitor.rawCommand(c);
    }

    private async verifyBreakpoints(path: string) {
        await this._monitor.delBreakpoints();
        let bps = this._breakPoints.get(path);
        if (bps) {
            for (const bp of bps) {
                if (!bp.verified) {
                    const addr = findSourceLoc(this._debugInfo, path, bp.line);

                    if (addr) {
                        bp.verified = true;
                        await this._monitor.setBreakpoint(addr);
                        this.sendEvent('breakpointValidated', bp);
                    } else {
                        console.log('XXX unable find', bp);
                    }
                }
            }
        }
    }

    private sendEvent(event: string, ... args: any[]) {
        setImmediate(_ => {
            this.emit(event, ...args);
        });
    }
}