export interface VideoStreamOptions {
    width?: number;
    height?: number;
    framerate?: number;
}

export interface AudioStreamOptions {
    bitsPerSample?: number;
    sampleRate?: number;
    channelCount?: number;
}

export type StreamOptions = VideoStreamOptions &
    AudioStreamOptions & {
        video?: boolean;
        almostFinishedTrigger?: number;
    };

export interface Fingerprint {
    hash: string;
    fingerprint: string;
}

export interface Transport {
    ufrag: string;
    pwd: string;
    fingerprints: Fingerprint[];
    candidates: Candidate[];
}

export interface Conference {
    sessionId: number;
    transport: Transport;
    ssrcs: Ssrc[];
}

export interface Candidate {
    generation: string;
    component: string;
    protocol: string;
    port: string;
    ip: string;
    foundation: string;
    id: string;
    priority: string;
    type: string;
    network: string;
}

export interface Ssrc {
    ssrc: number;
    ssrcGroup: number[];
}

export interface Sdp {
    fingerprint: string | null;
    hash: string | null;
    setup: string | null;
    pwd: string | null;
    ufrag: string | null;
    source: number | null;
    sourceGroup: number[] | null;
}

export interface JoinVoiceCallParams<T> {
    ufrag: string;
    pwd: string;
    hash: string;
    setup: 'active';
    fingerprint: string;
    source: number;
    sourceGroup: number[];
    params: T;
}

export interface JoinVoiceCallResponse {
    transport: Transport | null;
}

export type JoinVoiceCallCallback<T> = (
    payload: JoinVoiceCallParams<T>,
) => Promise<JoinVoiceCallResponse>;
