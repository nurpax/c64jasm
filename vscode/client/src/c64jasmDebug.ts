/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {
    Logger, logger,
    LoggingDebugSession,
    InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent,
    Thread, Breakpoint, Handles, Scope
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { C64jasmRuntime, C64Regs } from './c64jasmRuntime';
const { Subject } = require('await-notify');


/**
 * This interface describes the C64jasm-debug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the C64jasm-debug extension.
 * The interface should always match this schema.
 */
interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** An absolute path to the "program" to debug. */
    program: string;
    /** Automatically stop target after launch. If not specified, target does not stop. */
    stopOnEntry?: boolean;
    /** enable logging the Debug Adapter Protocol */
    trace?: boolean;
}

export class C64jasmDebugSession extends LoggingDebugSession {

    // we don't support multiple threads, so we can use a hardcoded ID for the default thread
    private static THREAD_ID = 1;

    private variableHandles = new Handles<string>();

    // a C64jasm runtime (or debugger)
    private _runtime: C64jasmRuntime;

    private _configurationDone = new Subject();

    private _regs: C64Regs = {
        addr: 0,
        a: 0,
        x: 0,
        y: 0,
        sp: 0,
        v00: 0,
        v01: 0,
        flags: 0,
        line: 0,
        cycle: 0,
        stopwatch: 0
    };

    private _vicePath: string;

    /**
     * Creates a new debug adapter that is used for one debug session.
     * We configure the default implementation of a debug adapter here.
     */
    public constructor() {
        super("c64jasm-debug.txt");

        // this debugger uses zero-based lines and columns
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);

        this._runtime = new C64jasmRuntime();

        // setup event handlers
        this._runtime.on('stopOnEntry', () => {
            this.sendEvent(new StoppedEvent('entry', C64jasmDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnStep', () => {
            this.sendEvent(new StoppedEvent('step', C64jasmDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnBreakpoint', () => {
            this.sendEvent(new StoppedEvent('breakpoint', C64jasmDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnException', () => {
            this.sendEvent(new StoppedEvent('exception', C64jasmDebugSession.THREAD_ID));
        });
        this._runtime.on('breakpointValidated', (bp) => {
            this.sendEvent(new BreakpointEvent('changed', <DebugProtocol.Breakpoint>{ verified: bp.verified, id: bp.id }));
        });
        this._runtime.on('output', (text) => {
            const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`);
            this.sendEvent(e);
        });
        this._runtime.on('registers', (regs: C64Regs) => {
            this._regs = regs;
        });
        this._runtime.on('end', () => {
            this.sendEvent(new TerminatedEvent());
        });
    }

    public setVicePath(vicePath: string) {
        this._vicePath = vicePath;
    }

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    protected initializeRequest(response: DebugProtocol.InitializeResponse, _args: DebugProtocol.InitializeRequestArguments): void {

        // build and return the capabilities of this debug adapter:
        response.body = response.body || {};

        // the adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportTerminateDebuggee = true;

        this.sendResponse(response);

        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent());
    }

    /**
     * Called at the end of the configuration sequence.
     * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
     */
    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
        super.configurationDoneRequest(response, args);

        // notify the launchRequest that configuration has finished
        this._configurationDone.notify();
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {

        // make sure to 'Stop' the buffered logging if 'trace' is not set
        logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);

        // wait until configuration has finished (and configurationDoneRequest has been called)
        await this._configurationDone.wait(1000);

        // start the program in the runtime
        this._runtime.start(args.program, !!args.stopOnEntry, this._vicePath);

        this.sendResponse(response);
    }

    protected async terminateRequest(response: DebugProtocol.TerminateResponse) {
        this._runtime.terminate().then(() => this.sendResponse(response));
    }

    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse) {
        // TODO this probably shouldn't terminate VICE but rather just exit the
        // remote monitor
        this._runtime.terminate().then(() => this.sendResponse(response));
    }

    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {

        const path = <string>args.source.path;
        const clientLines = args.lines || [];

        // clear all breakpoints for this file and set new breakpoints
        this._runtime.clearBreakpoints(path).then(() => {
            Promise.all(clientLines.map(async l => {
                let { verified, line, id } = await this._runtime.setBreakPoint(path, this.convertClientLineToDebugger(l));
                const bp = <DebugProtocol.Breakpoint> new Breakpoint(verified, this.convertDebuggerLineToClient(line));
                bp.id = id;
                return bp;
            })).then(actualBreakpoints => {
                // send back the actual breakpoint positions
                response.body = {
                    breakpoints: actualBreakpoints
                };
                this.sendResponse(response);
            });
        })
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

        // runtime supports now threads so just return a default thread.
        response.body = {
            threads: [
                new Thread(C64jasmDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        const stk = this._runtime.stack();
        if (stk) {
            response.body = {
                stackFrames: [stk],
                totalFrames: 1
            };
        } else {
            response.body = { stackFrames: [], totalFrames: 0 };
        }
        this.sendResponse(response);
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        const frameReference = args.frameId;
        const scopes = new Array<Scope>();
        scopes.push(new Scope("Registers", this.variableHandles.create("registers_" + frameReference), false));

        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        const id = this.variableHandles.get(args.variablesReference);
        if (id !== null) {
            if (id.startsWith("registers_")) {
                //Gets the frameId
                let frameId = parseInt(id.substring(10));
                // TODO query registers
                const variables = new Array<DebugProtocol.Variable>();
                const addReg = (n: string, v: number) => {
                    variables.push({
                        name: n,
                        type: 'register',
                        value: v.toString(),
                        variablesReference: 0
                    })
                };
                addReg('A', this._regs.a);
                addReg('X', this._regs.x);
                addReg('Y', this._regs.y);
                addReg('pc', this._regs.addr);
                response.body = {
                    variables: variables
                };
                this.sendResponse(response);
            }
        }
    }


    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this._runtime.continue().then(() => this.sendResponse(response));
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this._runtime.next().then(() => this.sendResponse(response));
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        this._runtime.step().then(() => this.sendResponse(response));
    }

    protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments): void {
        this._runtime.pause().then(() => this.sendResponse(response));
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {

        let reply: string | undefined = undefined;

        if (args.context === 'repl') {
            // 'evaluate' supports to create and delete breakpoints from the 'repl':
            const matches = /c(ont)?/.exec(args.expression);
            if (matches) {
                // TODO this is a promise too now?!?!
                this._runtime.continue();
                reply = `continued`;
            } else {
                const matches = /disass/.exec(args.expression);
                if (matches) {
                    this._runtime.disass();
                } else if (args.expression == 'n') {
                    this._runtime.next();
                } else if (args.expression == 's') {
                    this._runtime.step();
                } else {
                    this._runtime.rawCommand(args.expression);
                }
            }
        }

        response.body = {
            result: reply ? reply : `evaluate(context: '${args.context}', '${args.expression}')`,
            variablesReference: 0
        };
        this.sendResponse(response);
    }
}
