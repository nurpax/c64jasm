
import { readFileSync } from 'fs';
import { EventEmitter } from 'events';

import { ChildProcess } from 'child_process'
import * as child_process from 'child_process'
import * as net from 'net';

export interface C64jasmBreakpoint {
    id: number;
    line: number;
    verified: boolean;
}

class MonitorConnection {
    private client: net.Socket;
    private echo: (str: string) => void;

    constructor(echo: (str: string) => void) {
        this.echo = echo;
    }

    connect() {
        this.client = net.createConnection({ port: 6510, timeout:5000 }, () => {
            console.log('Connected to VICE monitor');
        });

        this.client.once('data', data => {
            this.echo(data.toString());
        });
    }

    setBreakpoint(pc: number): Promise<void> {
        return new Promise(resolve => {
            const cmd = `break ${pc.toString(16)}\r\n`;
            this.client.once('data', data => {
                this.echo(data.toString());
                resolve();
            });
            this.client.write(cmd);
        })
    }

    delBreakpoints(): Promise<void> {
        return new Promise(resolve => {
            this.client.once('data', data => {
                this.echo(data.toString());
                resolve();
            });
            this.client.write('del\r\n');
        })
    }

    go(pc?: number): Promise<void> {
        return new Promise(resolve => {
            const cmd = pc === undefined ?
                'g' : `g ${pc.toString(16)}`;
            this.client.once('data', data => {
                this.echo(data.toString());
                resolve();
            });
            this.client.write(cmd + '\r\n');
        });
    }

    disass(pc?: number): Promise<void> {
        return new Promise(resolve => {
            const cmd = pc === undefined ?
                'disass' : `disass ${pc.toString(16)}`;
            this.client.once('data', data => {
                this.echo(data.toString());
                resolve();
            });
            this.client.write(cmd + '\r\n');
        })
    }

    rawCommand(cmd: string): Promise<void> {
        return new Promise(resolve => {
            this.client.once('data', data => {
                this.echo(data.toString());
                resolve();
            });
            this.client.write(cmd + '\r\n');
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

    // This is the next line that will be 'executed'
    private _currentLine = 0;

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
        this._monitor.connect();

        // Stop the debugger once the VICE process exits.
        this._viceProcess.on('close', (code, signal) => {
            this.sendEvent('end');
        })
        this._currentLine = -1;

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

    /**
     * Step to the next/previous non empty line.
     */
    public step(event = 'stopOnStep') {
        this.run(event);
    }

    /**
     * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
     */
    public stack(startFrame: number, endFrame: number): any {

        const words = this._sourceLines[this._currentLine].trim().split(/\s+/);

        const frames = new Array<any>();
        // every word of the current line becomes a stack frame.
        for (let i = startFrame; i < Math.min(endFrame, words.length); i++) {
            const name = words[i];	// use a word of the line as the stackframe name
            frames.push({
                index: i,
                name: `${name}(${i})`,
                file: this._sourceFile,
                line: this._currentLine
            });
        }
        return {
            frames: frames,
            count: words.length
        };
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
        return;
/*        for (let ln = this._currentLine+1; ln < this._sourceLines.length; ln++) {
            if (this.fireEventsForLine(ln, stepEvent)) {
                this._currentLine = ln;
                return;
            }
        }
        // no more lines: run to end
        this.sendEvent('end');*/
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