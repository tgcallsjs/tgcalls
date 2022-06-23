import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { RTCVideoSource, RTCAudioSource, nonstandard } from 'wrtc';
import {
    RemotePlayingTimeCallback,
    StreamOptions,
    RemoteLaggingCallback,
} from './types';

export declare interface Stream {
    on(event: 'pause', listener: (paused: boolean) => void): this;
    on(event: 'finish', listener: () => void): this;
    on(event: 'almost-finished', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: string, listener: Function): this;
}

export class Stream extends EventEmitter {
    private readonly audioSource: RTCAudioSource;
    private readonly videoSource: RTCVideoSource;
    private readable?: Readable;
    private cache: Buffer[];

    private _paused = false;
    private _finished = true;
    private _stopped = false;
    private _finishedLoading = false;
    private _emittedAlmostFinished = false;
    private lastDifference = 0;
    readonly video: boolean = false;
    public width: number = 640;
    public height: number = 360;
    readonly framerate: number = 24;
    readonly bitsPerSample: number;
    readonly sampleRate: number;
    readonly channelCount: number;
    private almostFinishedTrigger: number;
    private byteLength: number;
    private cacheSize: number = 0;
    private playedBytes = 0;
    private chunk: Buffer;
    private _readablePaused = false;

    remoteTime?: RemotePlayingTimeCallback;
    remoteLagging?: RemoteLaggingCallback;

    constructor(readable?: Readable, options?: StreamOptions) {
        super();

        if (typeof options?.video === 'boolean') {
            this.video = options?.video ?? true;
        } else if (options?.video) {
            this.video = true;
            this.width = options.video.width ?? this.width;
            this.height = options.video.height ?? this.height;
            this.framerate = options.video.framerate ?? this.framerate;
        }

        this.bitsPerSample = options?.audio?.bitsPerSample ?? 16;
        this.sampleRate = options?.audio?.sampleRate ?? 65000;
        this.channelCount = options?.audio?.channelCount ?? 1;
        this.almostFinishedTrigger = options?.almostFinishedTrigger ?? 20;

        this.audioSource = new nonstandard.RTCAudioSource();
        this.videoSource = new nonstandard.RTCVideoSource();

        this.byteLength = this.video
            ? 1.5 * this.width * this.height
            : ((this.sampleRate * this.bitsPerSample) / 8 / 100) *
              this.channelCount;
        this.cache = [];

        this.chunk = Buffer.alloc(this.byteLength);
        this.setReadable(readable);
        this.processData();
    }

    private requiredTime() {
        return this.video ? 0.5 : 50;
    }

    setReadable(readable?: Readable) {
        if (this._stopped) {
            throw new Error('Cannot set readable when stopped');
        }

        if (this.readable) {
            this.readable.removeListener('data', this.dataListener);
            this.readable.removeListener('end', this.endListener);
        }

        if (readable) {
            this._finished = false;
            this._finishedLoading = false;
            this._emittedAlmostFinished = false;
            this.readable = readable;
            this.cache.splice(0, this.cache.length);
            this.cacheSize = 0;
            this.playedBytes = 0;
            this.chunk = Buffer.alloc(this.byteLength);
            this.readable.addListener('data', this.dataListener);
            this.readable.addListener('end', this.endListener);
        }
    }

    pause() {
        if (this._stopped) {
            throw new Error('Cannot pause when stopped');
        }

        this._paused = !this._paused;
        this.emit('pause', this._paused);
    }

    get paused() {
        return this._paused;
    }

    finish() {
        this._finished = true;
        this.emit('finish');
    }

    get finished() {
        return this._finished;
    }

    stop() {
        this.finish();
        this._stopped = true;
    }

    get stopped() {
        return this._stopped;
    }

    createTrack() {
        return this.video
            ? this.videoSource.createTrack()
            : this.audioSource.createTrack();
    }

    private dataListener = ((data: Buffer) => {
        this.cache.push(data);
        this.cacheSize += data.length;
    }).bind(this);

    private endListener = (() => {
        this._finishedLoading = true;
    }).bind(this);

    private remoteIsLagging() {
        if (
            this.remoteTime !== undefined &&
            !this.paused &&
            this.remoteLagging !== undefined
        ) {
            const time = this.time();
            const remoteTime = this.remoteTime().time;

            if (time !== undefined && remoteTime !== undefined) {
                if (time > remoteTime) {
                    this.lastDifference = (time - remoteTime) * 100000;
                    return true;
                } else if (this.remoteLagging().lagging && remoteTime > time) {
                    this.lastDifference = 0;
                    return true;
                }
            }
        }

        return false;
    }

    private processData = () => {
        if (this._stopped) {
            return;
        }

        const timeout = this.frameTime() - this.lastDifference;

        this.checkOverflow();

        setTimeout(() => this.processData(), timeout);

        if (
            !this._paused &&
            !this._finished &&
            !this.remoteIsLagging() &&
            (this.cacheSize > this.byteLength || this._finishedLoading)
        ) {
            let chunkSize = 0;

            this.cache.find((chunk, i) => {
                if (chunkSize === 0) {
                    chunk.copy(this.chunk, 0, 0, this.byteLength);
                    chunkSize = Math.min(chunk.length, this.byteLength);
                    this.cache[i] = chunk.slice(this.byteLength);
                } else {
                    const req = this.byteLength - chunkSize;
                    const tmpChunk =
                        req < chunk.length ? chunk.slice(0, req) : chunk;
                    tmpChunk.copy(this.chunk, chunkSize);
                    chunkSize += tmpChunk.length;
                    this.cache[i] = chunk.slice(req);
                }

                return chunkSize >= this.byteLength;
            });

            this.cacheSize -= this.byteLength;
            // remove empty buffers
            this.cache.splice(
                0,
                this.cache.findIndex(i => i.length),
            );
            this.playedBytes += this.byteLength;
            this.broadcast();
        }

        if (!this._finished && this._finishedLoading) {
            if (
                !this._emittedAlmostFinished &&
                this.cacheSize <
                    this.byteLength +
                        this.almostFinishedTrigger * this.sampleRate
            ) {
                this._emittedAlmostFinished = true;
                this.emit('almost-finished');
            } else if (this.cacheSize < this.byteLength) {
                this.finish();
            }
        }
    };

    private checkOverflow() {
        const frameTime = this.video ? this.framerate : 100;
        const cachedTime = this.cacheSize / this.byteLength / frameTime;
        const neededTime = this.video ? 5 : 60;
        if (cachedTime > neededTime) {
            if (!this._readablePaused) {
                this.readable!.pause();
                this._readablePaused = true;
            }
        } else if (cachedTime < neededTime / 2 && this._readablePaused) {
            this.readable!.resume();
            this._readablePaused = false;
        }
    }

    public isLagging() {
        if (this._finishedLoading) {
            return false;
        }

        return this.cacheSize < this.byteLength * this.requiredTime();
    }

    private frameTime(): number {
        return this.finished ||
            this.paused ||
            this.isLagging() ||
            this.readable === undefined
            ? 500
            : this.video
            ? 1000 / this.framerate
            : 10;
    }

    private broadcast() {
        if (this.cacheSize < this.byteLength) {
            return;
        }

        try {
            if (this.video) {
                this.videoSource.onFrame({
                    data: new Uint8ClampedArray(this.chunk),
                    width: this.width,
                    height: this.height,
                });
            } else {
                const samples = new Int16Array(
                    new Uint8Array(this.chunk).buffer,
                );
                this.audioSource.onData({
                    bitsPerSample: this.bitsPerSample,
                    sampleRate: this.sampleRate,
                    channelCount: this.channelCount,
                    numberOfFrames: samples.length,
                    samples,
                });
            }
        } catch (error) {
            this.emit('error', error);
        }
    }

    time(): number | undefined {
        if (this.readable === undefined || this.finished) {
            return undefined;
        } else {
            return Math.ceil(
                this.playedBytes /
                    this.byteLength /
                    (0.00001 / this.frameTime()),
            );
        }
    }
}
