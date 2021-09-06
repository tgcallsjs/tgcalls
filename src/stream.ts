import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { RTCVideoSource, RTCAudioSource, nonstandard } from 'wrtc';
import { StreamOptions } from './types';

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
    private cache: Buffer;
    private _paused = false;
    private _finished = true;
    private _stopped = false;
    private _finishedLoading = false;
    private _emittedAlmostFinished = false;

    readonly video: boolean = false;
    public width: number = 640;
    public height: number = 360;
    readonly framerate: number = 24;
    readonly bitsPerSample: number;
    readonly sampleRate: number;
    readonly channelCount: number;
    private almostFinishedTrigger: number;

    constructor(readable?: Readable, options?: StreamOptions) {
        super();

        if (typeof options?.video === 'boolean') {
            this.video = options?.video ?? true;
        } else if (options?.video) {
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
        this.cache = Buffer.alloc(0);

        this.setReadable(readable);
        this.processData();
    }

    setReadable(readable?: Readable) {
        if (this._stopped) {
            throw new Error('Cannot set readable when stopped');
        }

        if (this.readable) {
            this.readable.removeListener('data', this.dataListener);
            this.readable.removeListener('end', this.endListener);
        }

        this.cache = Buffer.alloc(0);

        if (readable) {
            this._finished = false;
            this._finishedLoading = false;
            this._emittedAlmostFinished = false;
            this.readable = readable;

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

    private dataListener = ((data: any) => {
        this.cache = Buffer.concat([this.cache, data]);
    }).bind(this);

    private endListener = (() => {
        this._finishedLoading = true;
    }).bind(this);

    private processData() {
        if (this._stopped) {
            return;
        }

        const byteLength = this.video
            ? 1.5 * this.width * this.height
            : ((this.sampleRate * this.bitsPerSample) / 8 / 100) *
              this.channelCount;

        if (
            !this._paused &&
            !this._finished &&
            (this.cache.length >= byteLength || this._finishedLoading)
        ) {
            const buffer = this.cache.slice(0, byteLength);
            this.cache = this.cache.slice(byteLength);

            try {
                if (this.video) {
                    this.videoSource.onFrame({
                        data: new Uint8ClampedArray(buffer),
                        width: this.width,
                        height: this.height,
                    });
                } else {
                    const samples = new Int16Array(
                        new Uint8Array(buffer).buffer,
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

        if (!this._finished && this._finishedLoading) {
            if (
                !this._emittedAlmostFinished &&
                this.cache.length <
                    byteLength + this.almostFinishedTrigger * this.sampleRate
            ) {
                this._emittedAlmostFinished = true;
                this.emit('almost-finished');
            } else if (this.cache.length < byteLength) {
                this.finish();
            }
        }

        setTimeout(
            () => this.processData(),
            this.video ? 1000 / this.framerate : 10,
        );
    }
}
