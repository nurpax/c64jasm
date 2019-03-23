
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

type Cmd = 'next' | 'step' | undefined;
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
                const breakRe2 = /^.*BREAK: ([0-9]+)\s+C:\$([0-9a-f]+)\s+.*/;
                match = line.match(breakRe2);
                if (match) {
                    const addr = parseInt(match[2], 16);
                    this.emit('break', addr);
                    continue;
                }

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
            }
        });
    }

    setBreakpoint(pc: number): Promise<void> {
        return new Promise(resolve => {
            const cmd = `break ${pc.toString(16)}\r\n`;
            this.prevCommand = undefined;
            this.client.write(cmd, () => resolve());
        })
    }

    delBreakpoints(): Promise<void> {
        return new Promise(resolve => {
            this.prevCommand = undefined;
            this.client.write('del\r\n', () => resolve());
        })
    }

    go(pc?: number): Promise<void> {
        return new Promise(resolve => {
            const cmd = pc === undefined ?
                'g' : `g ${pc.toString(16)}`;
            this.prevCommand = undefined;
            this.client.write(cmd+'\r\n', () => resolve());
        });
    }

    next(): Promise<void> {
        return new Promise(resolve => {
            this.prevCommand = 'next';
            this.client.write('next'+'\r\n', () => resolve());
        });
    }

    disass(pc?: number): Promise<void> {
        return new Promise(resolve => {
            const cmd = pc === undefined ?
                'disass' : `disass ${pc.toString(16)}`;
            this.prevCommand = undefined;
            this.client.write(cmd+'\r\n', () => resolve());
        })
    }

    rawCommand(cmd: string): Promise<void> {
        return new Promise(resolve => {
            this.prevCommand = undefined;
            this.client.write(cmd+'\r\n', () => resolve());
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

/**
 * A C64jasm runtime with minimal debugger functionality.
 */
export class C64jasmRuntime extends EventEmitter {

    // the initial (and one and only) file we are 'debugging'
    private _sourceFile: string;
    public get sourceFile() {
        return this._sourceFile;
    }

    // the contents (= lines) of the one and only file
    private _sourceLines: string[];

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
        this._viceProcess = child_process.exec(`x64 -remotemonitor ${program}`);
        await sleep(5000);

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

        // Stop the debugger once the VICE process exits.
        this._viceProcess.on('close', (code, signal) => {
            this.sendEvent('end');
        })
        await this.verifyBreakpoints(this._sourceFile);

        if (stopOnEntry) {
            // we step once
            this.step('stopOnEntry');
        } else {
            // we just start to run until we hit a breakpoint or an exception
            this.continue();
        }
    }

    public terminate() {
        this._viceProcess.kill();
    }

    /**
     * Continue execution to the end/beginning.
     */
    public continue() {
        this.run(undefined);
    }

    public step(event = 'stopOnStep') {
        this._monitor.next();
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
    }

    /**
     * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
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

    // private methods

    private loadSource(file: string) {
        if (this._sourceFile !== file) {
            this._sourceFile = file;
            this._sourceLines = readFileSync(this._sourceFile).toString().split('\n');
        }
    }

    /**
     * Run through the file.
     * If stepEvent is specified only run a single step and emit the stepEvent.
     */
    private run(stepEvent?: string) {
        this._monitor.go();
    }

    private async verifyBreakpoints(path: string) {
        await this._monitor.delBreakpoints();
        let bps = this._breakPoints.get(path);
        if (bps) {
            this.loadSource(path);
            for (const bp of bps) {
                if (!bp.verified && bp.line < this._sourceLines.length) {
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

    /**
     * Fire events if line has a breakpoint or the word 'exception' is found.
     * Returns true is execution needs to stop.
     */
    private fireEventsForLine(ln: number, stepEvent?: string): boolean {
        // is there a breakpoint?
        const breakpoints = this._breakPoints.get(this._sourceFile);
        if (breakpoints) {
            const bps = breakpoints.filter(bp => bp.line === ln);
            if (bps.length > 0) {
                // send 'stopped' event
                this.sendEvent('stopOnBreakpoint');
                return true;
            }
        }

        // nothing interesting found -> continue
        return false;
    }

    private sendEvent(event: string, ... args: any[]) {
        setImmediate(_ => {
            this.emit(event, ...args);
        });
    }
}