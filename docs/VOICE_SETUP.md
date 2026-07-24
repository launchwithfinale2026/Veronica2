# VERONICA Voice Setup

The voice layer (`core/voice/`) is an OFF-by-default, optional capability
that connects a real local microphone to VERONICA's existing Router and
Agent architecture: wake word detection, speech-to-text, and
text-to-speech, all with free, local-first tools. No cloud audio
service is used or required. Nothing else in this codebase depends on
voice being enabled.

## What voice actually is

```
Microphone -> openWakeWord -> "Veronica" detected -> record command ->
whisper.cpp -> transcript -> existing Router -> existing Agent System ->
response text -> speech formatting -> Voice Identity -> Piper ->
audio output
```

Voice does not add a second router, a second agent system, or a second
memory store -- `core/voice/voiceEngine.js` routes every transcript
through the exact same `core/router` `Router` instance
`core/interface/terminal.js`'s `ask` command already uses. Voice
identity and speech formatting (below) only ever affect HOW a real
response is spoken -- never WHAT is said. No personality/emotion system
or avatar exists in this codebase.

## Voice identity

`core/voice/voiceIdentity.js` defines VERONICA's vocal characteristics
-- never canned phrases. `core/voice/textToSpeech.js` reads it on every
`speak()` call:

```
VOICE_SPEAKING_RATE=1.0    # Piper's real --length_scale; higher = slower
VOICE_PITCH=default        # carried through; Piper has no direct pitch-shift flag today
VOICE_STYLE=calm-professional  # informational label today, not a Piper CLI flag
```

`core/voice/speechFormatter.js` reshapes a raw agent response for
clarity before it's spoken (e.g. `"Agent count: 9."` -> `"agent count is
9."`) -- a real, deterministic, rule-based rewrite that never alters a
fact or invents content (see the module's own header comment for the
one deliberate scope limitation: it does not fabricate an evaluative
summary sentence that isn't literally supported by the input).

## Interruption

Say "Veronica" again while she's still speaking a response, and the
audio output stops immediately -- VERONICA goes straight back to
listening and accepts your new command. This only ever interrupts audio
playback; a real agent call has already finished by the time anything
is playing, so there is nothing in-flight to interrupt. See
`core/voice/textToSpeech.js`'s `stopPlayback()`/`isSpeaking()` and
`core/voice/voiceEngine.js`'s `interrupt()`.

## Required installs

All free, all local, none required unless you want that specific piece
of the pipeline:

| Tool | Purpose | Install |
|---|---|---|
| [SoX](http://sox.sourceforge.net/) | Microphone capture | `brew install sox` (macOS) |
| [openWakeWord](https://github.com/dscripka/openWakeWord) | Wake word detection | `pip install openwakeword numpy` |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Speech to text | Clone + `make`, download a ggml model (e.g. `ggml-base.en.bin`) |
| [Piper](https://github.com/rhasspy/piper) | Text to speech | Download the `piper` binary + a voice model (`.onnx`) |

A custom wake-word model for the literal word "Veronica" is **not**
one of openWakeWord's pretrained models (those are
alexa/hey_jarvis/hey_mycroft/etc.) -- train one with openWakeWord's own
training utility and point `WAKEWORD_MODEL` at the resulting file. Until
you do, `core/voice/external/wake_word_listener.py` can run with one of
openWakeWord's built-in models instead (omit `--model`), so you can
verify the rest of the pipeline works before training a custom model.

## Environment variables

Set these in `.env`. Every one of them is optional -- an unset/missing
value simply disables the one piece that needs it (see "Troubleshooting"
below for how that's reported).

```
VOICE_ENABLED=true

# Speech to text (whisper.cpp)
WHISPER_PATH=/path/to/whisper.cpp/main
WHISPER_MODEL=/path/to/ggml-base.en.bin

# Text to speech (Piper)
PIPER_PATH=/path/to/piper
PIPER_MODEL=/path/to/en_US-lessac-medium.onnx

# Wake word (openWakeWord, via core/voice/external/wake_word_listener.py)
VOICE_WAKE_WORD_COMMAND=python3
VOICE_WAKE_WORD_ARGS=core/voice/external/wake_word_listener.py
WAKEWORD_MODEL=/path/to/veronica_model.onnx
```

Less commonly needed overrides:

```
VOICE_MIC_COMMAND=sox                # microphone capture command
VOICE_MIC_ARGS=-d -t raw -r 16000 -e signed -b 16 -c 1 -
VOICE_PLAYBACK_COMMAND=afplay        # macOS built-in; override for another OS
VOICE_LISTEN_SECONDS=4               # how long to record after "Veronica"
```

`WHISPER_PATH`/`PIPER_PATH`/`WAKEWORD_MODEL` are the short, primary
names. The longer `VOICE_WHISPER_BINARY_PATH`/`VOICE_PIPER_BINARY_PATH`/
`VOICE_WAKE_WORD_MODEL_PATH` names from an earlier voice-layer revision
still work as a fallback.

## How to enable voice

1. Install whichever of the four tools above you want (all four for the
   full pipeline).
2. Set the matching environment variables in `.env`.
3. In code (voice is never auto-started -- see below for why):

   ```js
   const voice = require("./core/voice");
   voice.start();
   ```

   `start()` throws if `VOICE_ENABLED` isn't `"1"`/`"true"`, and runs a
   real startup validation (`voice.validateStartup()`) that logs a clear
   diagnostic for each of microphone/whisper.cpp/Piper/wake-word-model
   that isn't actually available -- it never crashes, and VERONICA
   keeps running normally either way.

Voice is **never** wired into `dashboard/backend/server.js`'s boot
sequence or `core/interface/terminal.js` automatically. An operator
opts in explicitly, the same way `scripts/install-launch-agent.sh` is
never run automatically either.

## Say "Veronica"

Once running, say the wake word, then your command:

> "Veronica" ... "What agents are online?"

VERONICA records your command for `VOICE_LISTEN_SECONDS` (4s by
default), transcribes it, routes it through the same Router/Agent
pipeline a terminal `ask` command uses, and speaks the response back.

## Troubleshooting

```js
const voice = require("./core/voice");
console.log(voice.status());
```

Returns real, evidence-based status -- never a mystery "is voice on"
flag:

```js
{
  enabled: true,
  wakeWord: { label: "Wake word detection", configured: true, missing: [] },
  speechToText: { label: "Speech to text (whisper.cpp)", configured: true, missing: [] },
  textToSpeech: { label: "Text to speech (Piper)", configured: false, missing: ["binaryPath", "modelPath"] },
  microphoneAvailable: true,
  microphoneRunning: true,
  wakeWordRunning: true,
  engineState: "LISTENING",
  voiceStatus: {
    enabled: true,
    state: "LISTENING",
    lastInteraction: "2026-07-24T01:02:03.000Z",
    modelLoaded: true
  }
}
```

`voiceStatus` is the exact shape a future dashboard panel will consume
(no UI is built here -- see `core/voice/voiceEngine.js`'s `status()`).
`state` is one of `IDLE` / `LISTENING` / `PROCESSING` / `SPEAKING` /
`INTERRUPTED` (`core/voice/conversationState.js`) -- `LISTENING` covers
both "waiting for the wake word" and "actively recording your command";
they're not distinguished at this level since either way VERONICA is
genuinely listening.

- **`microphoneAvailable: false`** -- SoX (or whatever `VOICE_MIC_COMMAND`
  points at) isn't installed or isn't on `PATH`. Run `sox --version`
  yourself to confirm.
- **`wakeWord.configured: false`** -- `VOICE_WAKE_WORD_COMMAND` or
  `WAKEWORD_MODEL` is unset, or the model file doesn't exist at that
  path.
- **`speechToText.configured: false`** -- `WHISPER_PATH`/`WHISPER_MODEL`
  unset or don't point at real files.
- **`textToSpeech.configured: false`** -- same, for `PIPER_PATH`/
  `PIPER_MODEL`. Voice can still listen, transcribe, and route commands
  without this configured -- it just can't speak the response back (the
  response is still routed and returned; see
  `core/voice/voiceEngine.js`'s `handleUtterance()`).
- **Nothing happens when you say "Veronica"** -- check
  `voice.status().engineState`. `"IDLE"` means `start()` was never
  called or failed; `"LISTENING"` means it's genuinely listening (either
  for the wake word, or actively recording your command -- the model
  just may not recognize your specific pronunciation/mic; try adjusting
  `--threshold` in `wake_word_listener.py`); `"PROCESSING"`/`"SPEAKING"`
  mid-command is normal.
- **Interrupting doesn't work** -- interruption only fires while
  `engineState` is `"SPEAKING"`; saying "Veronica" during `"PROCESSING"`
  (VERONICA is still thinking) is intentionally not detected at all --
  see `docs/CHANGELOG.md`'s Phase 44 entry for why ("do not interrupt
  agent execution").
- **A voice error never crashes anything else** -- every real failure
  in the pipeline (mic error, whisper.cpp failure, wake-word process
  exit) is caught, logged via `core/logging` (`log.error`/`log.warn`
  persist to `core/logging/errors.log`, already readable at the
  existing `GET /api/logs/errors` dashboard route), and published as a
  real `voice.error` bus event (see `core/voice/events.js`) rather than
  thrown -- or subscribe your own `bus.on("voice.error", ...)` listener.
