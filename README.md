# tgcallsjs

[![npm](https://img.shields.io/npm/v/tgcalls)][npm] [![Mentioned in Awesome Telegram Calls](https://awesome.re/mentioned-badge.svg)][awesome]

## Example

```ts
import { createReadStream } from 'fs';
import { TGCalls, Stream } from 'tgcalls';

const tgcalls = new TGCalls();

tgcalls.joinVoiceCall = payload => {
    // Somehow join voice call and get transport

    return transport;
};

const audioStream = new Stream(createReadStream('audio.raw'));
const videoStream = new Stream(createReadStream('video.raw'), { video: true });

// See the docs for more event types
// https://tgcallsjs.github.io/tgcalls/classes/stream.html#on
audioStream.on('finish', () => {
    console.log('Audio finished streaming');
});

tgcalls.start(audioStream.createTrack(), videoStream.createTrack());
```

## Required media properties

Video:

-   Format: `yuv420p`
-   Resolution: min 640x360, max 1280x720
-   FPS: 24 or what you provided in `StreamOptions`

Audio:

-   Format: `s16le`
-   Channels: 2
-   Bitrate: 65K or what you provided in `StreamOptions`

### Conversion with FFmpeg

Video:

```bash
ffmpeg -i [input] -f yuv420p -vf scale=640:-1 -r 24 [output]
```

Audio:

```bash
ffmpeg -i [input] -f s16le -ac 1 -ar 65K [output]
```

Or both from a video input:

```bash
ffmpeg -i [input] \
    -f s16le -ac 1 -ar 65K [audio_output] \
    -f yuv420p -vf scale=640:-1 -r 24 [video_output]
```

Note: these examples are using default values of configurable options.

## Related projects

-   [gram-tgcalls]: connects tgcallsjs with [GramJS] and makes using this library super easy.

## Credits

Big thanks to [@evgeny-nadymov] for allowing us to use their code from [telegram-react], and [@Laky-64] for helping write this library!

[npm]: https://www.npmjs.com/package/tgcalls
[awesome]: https://github.com/tgcalls/awesome-tgcalls
[gram-tgcalls]: https://github.com/tgcallsjs/gram-tgcalls
[gramjs]: https://github.com/gram-js/gramjs
[@evgeny-nadymov]: https://github.com/evgeny-nadymov/
[telegram-react]: https://github.com/evgeny-nadymov/telegram-react/
[@laky-64]: https://github.com/Laky-64/
