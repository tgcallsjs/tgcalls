# tgcallsjs

[![npm](https://img.shields.io/npm/v/tgcalls)][npm]

## Example

```ts
import { createReadStream } from 'fs';
import { TGCalls, Stream } from 'tgcalls';

const tgcalls = new TGCalls();

tgcalls.joinVoiceCall = payload => {
    // Somehow join voice call and get transport

    return transport;
};

const stream = new Stream(createReadStream('song.raw'));

// See the docs for more event types
// https://tgcallsjs.github.io/tgcalls/classes/stream.html#on
stream.on('finish', () => {
    console.log('Song finished');
});

tgcalls.start(stream.createTrack());
```

## Credits

Big thanks to [@evgeny-nadymov] for allowing us to use their code from [telegram-react], and [@Laky-64] for helping write this library!

[npm]: https://www.npmjs.com/package/tgcalls
[@evgeny-nadymov]: https://github.com/evgeny-nadymov/
[telegram-react]: https://github.com/evgeny-nadymov/telegram-react/
[@laky-64]: https://github.com/Laky-64/
