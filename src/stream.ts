import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { RTCAudioSource, nonstandard } from 'wrtc';

export class Stream extends EventEmitter {
    private readonly audioSource: RTCAudioSource;
    private readable?: Readable;
    private cache: Buffer;
    private _paused = false;
    private _finished = true;
    private _stopped = false;
    private _finishedLoading = false;
    private _emittedAlmostFinished = false;
    private dataListener?: (data: any) => void;
    private endListener?: () => void;

    constructor(
        readable?: Readable,
        readonly bitsPerSample = 16,
        readonly sampleRate = 65000,
        readonly channelCount = 1,
        private almostFinishedTrigger = 20,
    ) {
        super();

        this.audioSource = new nonstandard.RTCAudioSource();
        this.cache = Buffer.alloc(0);

        this.setReadable(readable);
        this.processData();
    }

    setReadable(readable?: Readable) {
        if (this._stopped) {
            throw new Error('Cannot set readable when stopped');
        }

        if (this.readable) {
            this.readable.removeListener('data', this.getDataListener());
            this.readable.removeListener('end', this.getEndListener());
        }

        this.cache = Buffer.alloc(0);

        if (readable) {
            this._finished = false;
            this._finishedLoading = false;
            this._emittedAlmostFinished = false;
            this.readable = readable;

            this.readable.addListener('data', this.getDataListener());
            this.readable.addListener('end', this.getEndListener());
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
        return this.audioSource.createTrack();
    }

    private getDataListener() {
        if (this.dataListener) {
            return this.dataListener;
        }

        this.dataListener = ((data: any) => {
            this.cache = Buffer.concat([this.cache, data]);
        }).bind(this);
        return this.dataListener;
    }

    private getEndListener() {
        if (this.endListener) {
            return this.endListener;
        }

        this.endListener = (() => {
            this._finishedLoading = true;
        }).bind(this);
        return this.endListener;
    }

    private processData() {
        if (this._stopped) {
            return;
        }

        const byteLength =
            ((this.sampleRate * this.bitsPerSample) / 8 / 100) *
            this.channelCount;

        if (
            !this._paused &&
            !this._finished &&
            (this.cache.length >= byteLength || this._finishedLoading)
        ) {
            const buffer = this.cache.slice(0, byteLength);
            const samples = new Int16Array(new Uint8Array(buffer).buffer);

            this.cache = this.cache.slice(byteLength);

            try {
                this.audioSource.onData({
                    bitsPerSample: this.bitsPerSample,
                    sampleRate: this.sampleRate,
                    channelCount: this.channelCount,
                    numberOfFrames: samples.length,
                    samples,
                });
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

        setTimeout(() => this.processData(), 10);
    }
}
