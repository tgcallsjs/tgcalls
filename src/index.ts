import { EventEmitter } from 'events';
import { RTCPeerConnection } from 'wrtc';
import { SdpBuilder } from './sdp-builder';
import { parseSdp } from './utils';
import { JoinVoiceCallCallback } from './types';

export { Stream } from './stream';

export class TGCalls<T> extends EventEmitter {
    #connection?: RTCPeerConnection;
    #params: T;

    joinVoiceCall?: JoinVoiceCallCallback<T>;

    constructor(params: T) {
        super();
        this.#params = params;
    }

    async start(track: MediaStreamTrack): Promise<void> {
        if (this.#connection) {
            throw new Error('Connection already started');
        } else if (!this.joinVoiceCall) {
            throw new Error('Please set the `joinVoiceCall` callback before calling `start()`');
        }

        this.#connection = new RTCPeerConnection();
        this.#connection.oniceconnectionstatechange = async () => {
            this.emit('iceConnectionState', this.#connection?.iceConnectionState);

            switch (this.#connection?.iceConnectionState) {
                case 'closed':
                case 'failed':
                    this.emit('hangUp');
                    break;
            }
        };

        this.#connection.addTrack(track);

        const offer = await this.#connection.createOffer({
            offerToReceiveVideo: false,
            offerToReceiveAudio: true,
        });

        await this.#connection.setLocalDescription(offer);

        if (!offer.sdp) {
            return;
        }

        const { ufrag, pwd, hash, fingerprint, source } = parseSdp(offer.sdp);
        if (!ufrag || !pwd || !hash || !fingerprint || !source) {
            return;
        }

        let transport;

        try {
            const joinVoiceCallResult = await this.joinVoiceCall({
                ufrag,
                pwd,
                hash,
                setup: 'active',
                fingerprint,
                source,
                params: this.#params,
            });
            transport = joinVoiceCallResult.transport;
        } catch (error) {
            this.close();
            throw error;
        }

        if (!transport) {
            this.close();
            throw new Error('No transport found');
        }

        const sessionId = Date.now();
        const conference = {
            sessionId,
            transport,
            ssrcs: [{ ssrc: source, isMain: true }],
        };

        await this.#connection.setRemoteDescription({
            type: 'answer',
            sdp: SdpBuilder.fromConference(conference, true),
        });
    }

    close() {
        this.#connection?.close();
        this.#connection = undefined;
    }
}
