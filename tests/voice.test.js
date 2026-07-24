const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const { EventEmitter } = require("node:events");

const bus = require("../core/bus");
const config = require("../core/voice/config");
const events = require("../core/voice/events");
const wav = require("../core/voice/wav");
const Microphone = require("../core/voice/microphone");
const WakeWordDetector = require("../core/voice/wakeWord");
const VoiceEngine = require("../core/voice/voiceEngine");

// A minimal, event-emitter-shaped stand-in for Node's real ChildProcess
// -- never spawns a real process. Same "fake the dependency boundary"
// approach tests/system-startup-manager.test.js already uses for its
// own FakeChild.
class FakeChild extends EventEmitter {
    constructor(){
        super();
        this.stdout = new EventEmitter();
        this.stderr = new EventEmitter();
        this.stdin = { writable: true, written: [], write(chunk){ this.written.push(chunk); } };
        this.killed = false;
    }
    kill(){
        this.killed = true;
    }
}

function fakeSpawnFactory(){
    const children = [];
    const spawnFn = () => {
        const child = new FakeChild();
        children.push(child);
        return child;
    };
    return { spawnFn, children };
}

function withEnv(overrides, fn){

    const original = { ...process.env };

    for(const [key, value] of Object.entries(overrides)){
        if(value === undefined){
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    try {
        return fn();
    } finally {
        process.env = original;
    }

}


// --- config.js: microphone() + status() -----------------------------

test("config.microphone() has a real, correct default SoX invocation for 16kHz mono 16-bit PCM", () => {

    withEnv({ VOICE_MIC_COMMAND: undefined, VOICE_MIC_ARGS: undefined }, () => {

        const mic = config.microphone();

        assert.strictEqual(mic.command, "sox");
        assert.deepStrictEqual(mic.args, ["-d", "-t", "raw", "-r", "16000", "-e", "signed", "-b", "16", "-c", "1", "-"]);
        assert.strictEqual(mic.sampleRate, 16000);
        assert.strictEqual(mic.channels, 1);
        assert.strictEqual(mic.bitDepth, 16);

    });

});


test("config.status() supports both the short (WHISPER_PATH) and legacy (VOICE_WHISPER_BINARY_PATH) env var names", () => {

    withEnv({
        WHISPER_PATH: __filename,
        WHISPER_MODEL: __filename,
        VOICE_WHISPER_BINARY_PATH: undefined,
        VOICE_WHISPER_MODEL_PATH: undefined
    }, () => {
        assert.strictEqual(config.status().speechToText.configured, true);
    });

    withEnv({
        WHISPER_PATH: undefined,
        WHISPER_MODEL: undefined,
        VOICE_WHISPER_BINARY_PATH: __filename,
        VOICE_WHISPER_MODEL_PATH: __filename
    }, () => {
        assert.strictEqual(config.status().speechToText.configured, true);
    });

});


test("config.isEnabled() accepts both \"1\" and \"true\"", () => {

    withEnv({ VOICE_ENABLED: "1" }, () => assert.strictEqual(config.isEnabled(), true));
    withEnv({ VOICE_ENABLED: "true" }, () => assert.strictEqual(config.isEnabled(), true));
    withEnv({ VOICE_ENABLED: "false" }, () => assert.strictEqual(config.isEnabled(), false));
    withEnv({ VOICE_ENABLED: undefined }, () => assert.strictEqual(config.isEnabled(), false));

});


// --- wav.js -----------------------------------------------------------

test("wav.encode() produces a real, correct canonical 44-byte PCM WAV header", () => {

    const pcm = Buffer.from([1, 2, 3, 4]);
    const wavBuffer = wav.encode(pcm, { sampleRate: 16000, channels: 1, bitDepth: 16 });

    assert.strictEqual(wavBuffer.length, 44 + pcm.length);
    assert.strictEqual(wavBuffer.toString("ascii", 0, 4), "RIFF");
    assert.strictEqual(wavBuffer.toString("ascii", 8, 12), "WAVE");
    assert.strictEqual(wavBuffer.toString("ascii", 36, 40), "data");
    assert.strictEqual(wavBuffer.readUInt32LE(24), 16000); // sample rate
    assert.strictEqual(wavBuffer.readUInt16LE(22), 1); // channels
    assert.strictEqual(wavBuffer.readUInt16LE(34), 16); // bit depth
    assert.strictEqual(wavBuffer.readUInt32LE(40), pcm.length); // data size
    assert.deepStrictEqual(wavBuffer.subarray(44), pcm);

});


// --- microphone.js: fail safely when unavailable ----------------------

test("Microphone.isAvailable() is false, for real, when the configured command fails to invoke", () => {

    const mic = new Microphone({ spawnSyncFn: () => ({ error: new Error("ENOENT") }) });
    assert.strictEqual(mic.isAvailable(), false);

});


test("Microphone.isAvailable() is true when the configured command really runs", () => {

    const mic = new Microphone({ spawnSyncFn: () => ({ error: null }) });
    assert.strictEqual(mic.isAvailable(), true);

});


test("Microphone.start() fails safely (never throws) when the real configured command doesn't exist -- a real, async ENOENT, same as sox not being installed", async () => {

    const mic = new Microphone({ spawnFn: () => {
        const child = new FakeChild();
        // Real child_process.spawn() never throws synchronously for a
        // missing binary -- ENOENT surfaces asynchronously via the
        // child's own "error" event. Mirrored here rather than faked
        // away, since microphone.js's real fail-safety depends on
        // handling exactly this async path, not just a synchronous
        // throw (see the synchronous-throw test above/below for that
        // separate real failure mode).
        setImmediate(() => child.emit("error", new Error("spawn sox ENOENT")));
        return child;
    } });

    const errors = [];
    mic.on("error", error => errors.push(error));

    let result;
    assert.doesNotThrow(() => { result = mic.start(); });

    // start() itself returns synchronously and optimistically -- the
    // real failure arrives moments later via the async "error" event,
    // exactly like a real missing binary would.
    assert.strictEqual(result.started, true);

    await new Promise(resolve => setImmediate(resolve));

    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].message.includes("ENOENT"));
    assert.strictEqual(mic.status().running, false);

});


test("Microphone.start() fails safely when spawning throws synchronously", () => {

    const mic = new Microphone({ spawnFn: () => { throw new Error("spawn ENOENT"); } });

    const errors = [];
    mic.on("error", error => errors.push(error));

    let result;
    assert.doesNotThrow(() => { result = mic.start(); });

    assert.strictEqual(result.started, false);
    assert.strictEqual(errors.length, 1);

});


test("Microphone emits real raw audio chunks on 'data' as they arrive from the real (fake) process", () => {

    const { spawnFn, children } = fakeSpawnFactory();
    const mic = new Microphone({ spawnFn });

    mic.start();

    const chunks = [];
    mic.on("data", chunk => chunks.push(chunk));

    const fakeAudio = Buffer.from([9, 9, 9]);
    children[0].stdout.emit("data", fakeAudio);

    assert.strictEqual(chunks.length, 1);
    assert.deepStrictEqual(chunks[0], fakeAudio);

    mic.stop();
    assert.strictEqual(children[0].killed, true);

});


// --- wakeWord.js: feed()/detection, still no speech processed --------

test("WakeWordDetector.feed() writes real microphone chunks into the inference process's stdin, and never before start()", () => {

    const { spawnFn, children } = fakeSpawnFactory();

    withEnv({ VOICE_WAKE_WORD_COMMAND: "fake-wake-word-listener" }, () => {

        const detector = new WakeWordDetector({ spawnFn });

        // Feeding before start() is a silent no-op -- nothing to crash.
        assert.doesNotThrow(() => detector.feed(Buffer.from([1, 2])));

        detector.start();

        const chunk = Buffer.from([1, 2, 3]);
        detector.feed(chunk);

        assert.strictEqual(children[0].stdin.written.length, 1);
        assert.deepStrictEqual(children[0].stdin.written[0], chunk);

        detector.stop();

    });

});


test("WakeWordDetector publishes voice.wakeWordDetected on a bare real \"WAKE\" line, and ignores everything else", () => {

    const { spawnFn, children } = fakeSpawnFactory();

    withEnv({ VOICE_WAKE_WORD_COMMAND: "fake-wake-word-listener" }, () => {

        const detector = new WakeWordDetector({ spawnFn });
        detector.start();

        const captured = [];
        const listener = data => captured.push(data);
        bus.on(events.WAKE_DETECTED, listener);

        try {
            children[0].stdout.emit("data", Buffer.from("Listening on stdin...\n"));
            children[0].stdout.emit("data", Buffer.from("WAKE\n"));
            children[0].stdout.emit("data", Buffer.from("WAKEFUL nonsense\n")); // must not match "WAKE" alone
        } finally {
            bus.off(events.WAKE_DETECTED, listener);
        }

        assert.strictEqual(captured.length, 1);
        assert.ok(captured[0].detectedAt);

        detector.stop();

    });

});


test("WakeWordDetector buffers a real \"WAKE\" line split across multiple stdout chunks", () => {

    const { spawnFn, children } = fakeSpawnFactory();

    withEnv({ VOICE_WAKE_WORD_COMMAND: "fake-wake-word-listener" }, () => {

        const detector = new WakeWordDetector({ spawnFn });
        detector.start();

        const captured = [];
        const listener = data => captured.push(data);
        bus.on(events.WAKE_DETECTED, listener);

        try {
            children[0].stdout.emit("data", Buffer.from("WA"));
            children[0].stdout.emit("data", Buffer.from("KE\n"));
        } finally {
            bus.off(events.WAKE_DETECTED, listener);
        }

        assert.strictEqual(captured.length, 1);

        detector.stop();

    });

});


test("WakeWordDetector.start() throws a clear error when unconfigured, never fabricating a detection", () => {

    withEnv({ VOICE_WAKE_WORD_COMMAND: undefined }, () => {
        const detector = new WakeWordDetector({ spawnFn: () => new FakeChild() });
        assert.throws(() => detector.start(), /Wake word detection is not configured/);
    });

});


// --- voiceEngine.js: fakes for router/mic/wakeWord/STT/TTS ------------

function fakeRouter(responseText){
    return {
        calls: [],
        async route(text){
            this.calls.push(text);
            return {
                agent: "XQZ-Voice-Agent",
                result: { cognition: { response: { response: responseText, provider: "fake" } } },
                timestamp: new Date()
            };
        }
    };
}

function fakeTextToSpeech(){
    return {
        calls: [],
        async speak(text){
            this.calls.push(text);
            return { outputPath: "/tmp/veronica-voice-fake-output.wav", played: true };
        }
    };
}

function fakeSpeechToText(transcript){
    return {
        calls: [],
        async transcribe(audioPath){
            this.calls.push(audioPath);
            if(transcript instanceof Error){
                throw transcript;
            }
            return transcript;
        }
    };
}

class FakeMicrophone extends EventEmitter {
    constructor({ available = true } = {}){
        super();
        this.available = available;
        this.started = false;
        this.stopped = false;
    }
    isAvailable(){ return this.available; }
    start(){ this.started = true; return { started: this.available }; }
    stop(){ this.stopped = true; return { stopped: true }; }
    status(){ return { running: this.started && !this.stopped }; }
}

class FakeWakeWord {
    constructor({ configured = true } = {}){
        this.configured = configured;
        this.fed = [];
        this.started = false;
    }
    isConfigured(){ return this.configured; }
    start(){ this.started = true; return { started: true }; }
    stop(){ this.started = false; return { stopped: true }; }
    feed(chunk){ this.fed.push(chunk); }
}


// --- "microphone unavailable does not crash" --------------------------

test("VoiceEngine.start() fails safely (never throws) and publishes voice.error when the microphone is unavailable", () => {

    const router = fakeRouter("unused");
    const microphone = new FakeMicrophone({ available: false });
    const wakeWord = new FakeWakeWord({ configured: true });

    const engine = new VoiceEngine({ router, microphone, wakeWord });

    const errors = [];
    const listener = data => errors.push(data);
    bus.on(events.ERROR, listener);

    let result;
    try {
        assert.doesNotThrow(() => { result = engine.start(); });
    } finally {
        bus.off(events.ERROR, listener);
    }

    assert.strictEqual(result.started, false);
    assert.strictEqual(engine.status().state, "idle");
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(microphone.started, false);

});


test("VoiceEngine.start() fails safely when wake word detection is unconfigured", () => {

    const router = fakeRouter("unused");
    const microphone = new FakeMicrophone({ available: true });
    const wakeWord = new FakeWakeWord({ configured: false });

    const engine = new VoiceEngine({ router, microphone, wakeWord });

    let result;
    assert.doesNotThrow(() => { result = engine.start(); });

    assert.strictEqual(result.started, false);
    assert.strictEqual(engine.status().state, "idle");

});


// --- "wake event triggers listening state" ----------------------------

test("VoiceEngine transitions waiting -> listening on a real wake detection, and publishes voice.listening", () => {

    const router = fakeRouter("unused");
    const microphone = new FakeMicrophone();
    const wakeWord = new FakeWakeWord();

    const engine = new VoiceEngine({ router, microphone, wakeWord, listenSeconds: 999 });

    const started = engine.start();
    assert.strictEqual(started.started, true);
    assert.strictEqual(engine.status().state, "waiting");
    assert.strictEqual(microphone.started, true);
    assert.strictEqual(wakeWord.started, true);

    const listeningEvents = [];
    const listener = data => listeningEvents.push(data);
    bus.on(events.LISTENING, listener);

    try {
        bus.publish(events.WAKE_DETECTED, { detectedAt: new Date().toISOString() });
    } finally {
        bus.off(events.LISTENING, listener);
    }

    assert.strictEqual(engine.status().state, "listening");
    assert.strictEqual(listeningEvents.length, 1);

    engine.stop();

});


test("VoiceEngine routes real microphone chunks to wake-word inference only while waiting, and buffers them (not wake-word) while listening", () => {

    const router = fakeRouter("unused");
    const microphone = new FakeMicrophone();
    const wakeWord = new FakeWakeWord();

    const engine = new VoiceEngine({ router, microphone, wakeWord, listenSeconds: 999 });
    engine.start();

    const chunkBeforeWake = Buffer.from([1]);
    microphone.emit("data", chunkBeforeWake);
    assert.deepStrictEqual(wakeWord.fed, [chunkBeforeWake]);
    assert.strictEqual(engine.listenBuffer.length, 0);

    bus.publish(events.WAKE_DETECTED, {});

    const chunkAfterWake = Buffer.from([2]);
    microphone.emit("data", chunkAfterWake);

    // Not fed to wake-word again -- "do not process speech before
    // activation" also means not re-triggering wake mid-command.
    assert.deepStrictEqual(wakeWord.fed, [chunkBeforeWake]);
    assert.strictEqual(engine.listenBuffer.length, 1);
    assert.deepStrictEqual(engine.listenBuffer[0], chunkAfterWake);

    engine.stop();

});


// --- "transcript enters Router" + "Router response reaches TTS" ------

test("VoiceEngine.handleUtterance() routes real text through the real core/router Router interface", async () => {

    const router = fakeRouter("XQZ real response text");
    const tts = fakeTextToSpeech();

    const engine = new VoiceEngine({ router, microphone: new FakeMicrophone(), wakeWord: new FakeWakeWord(), textToSpeech: tts });

    const result = await engine.handleUtterance("what agents are online");

    assert.deepStrictEqual(router.calls, ["what agents are online"]);
    assert.strictEqual(result.routed.agent, "XQZ-Voice-Agent");

});


test("VoiceEngine.handleUtterance() passes the router's real response text to the TTS layer", async () => {

    const router = fakeRouter("XQZ spoken-back response");
    const tts = fakeTextToSpeech();

    const engine = new VoiceEngine({ router, microphone: new FakeMicrophone(), wakeWord: new FakeWakeWord(), textToSpeech: tts });

    const result = await engine.handleUtterance("XQZ test utterance");

    assert.deepStrictEqual(tts.calls, ["XQZ spoken-back response"]);
    assert.strictEqual(result.spoken.played, true);

});


test("VoiceEngine's full mic-driven flow: wake -> record -> whisper -> Router -> TTS, end to end", async () => {

    const router = fakeRouter("XQZ full-flow response");
    const tts = fakeTextToSpeech();
    const stt = fakeSpeechToText("XQZ transcribed utterance");
    const microphone = new FakeMicrophone();
    const wakeWord = new FakeWakeWord();

    const engine = new VoiceEngine({ router, microphone, wakeWord, textToSpeech: tts, speechToText: stt, listenSeconds: 999 });
    engine.start();

    bus.publish(events.WAKE_DETECTED, {});
    assert.strictEqual(engine.status().state, "listening");

    microphone.emit("data", Buffer.from([1, 2, 3, 4]));
    microphone.emit("data", Buffer.from([5, 6]));

    const routedEvents = [];
    const spokenEvents = [];
    const onRouted = data => routedEvents.push(data);
    const onSpoken = data => spokenEvents.push(data);
    bus.on(events.ROUTED, onRouted);
    bus.on(events.SPOKEN, onSpoken);

    let result;
    try {
        result = await engine.finishListening();
    } finally {
        bus.off(events.ROUTED, onRouted);
        bus.off(events.SPOKEN, onSpoken);
    }

    // whisper.cpp was really called with a real, existing WAV file on
    // disk containing exactly the buffered PCM bytes.
    assert.strictEqual(stt.calls.length, 1);
    const audioPath = stt.calls[0];
    assert.ok(fs.existsSync(audioPath));
    const written = fs.readFileSync(audioPath);
    assert.strictEqual(written.toString("ascii", 0, 4), "RIFF");
    assert.deepStrictEqual(written.subarray(44), Buffer.from([1, 2, 3, 4, 5, 6]));
    fs.unlinkSync(audioPath);

    assert.deepStrictEqual(router.calls, ["XQZ transcribed utterance"]);
    assert.deepStrictEqual(tts.calls, ["XQZ full-flow response"]);
    assert.strictEqual(result.spoken.played, true);

    assert.strictEqual(routedEvents.length, 1);
    assert.strictEqual(spokenEvents.length, 1);

    // Back to "waiting" for the next real wake word -- not stuck in
    // "processing".
    assert.strictEqual(engine.status().state, "waiting");

    engine.stop();

});


test("VoiceEngine.finishListening() with no recorded audio logs a warning and returns to waiting without crashing", async () => {

    const router = fakeRouter("unused");
    const stt = fakeSpeechToText("unused");
    const engine = new VoiceEngine({ router, microphone: new FakeMicrophone(), wakeWord: new FakeWakeWord(), speechToText: stt, listenSeconds: 999 });

    engine.start();
    bus.publish(events.WAKE_DETECTED, {});

    const result = await engine.finishListening();

    assert.strictEqual(result, null);
    assert.strictEqual(stt.calls.length, 0);
    assert.strictEqual(engine.status().state, "waiting");

    engine.stop();

});


// --- "voice failure does not affect existing terminal/dashboard systems"

test("A real whisper.cpp failure during the mic-driven flow is caught, published as voice.error, and never thrown -- voice isolation", async () => {

    const router = fakeRouter("unused");
    const stt = fakeSpeechToText(new Error("whisper.cpp exited with code 1: real failure"));
    const microphone = new FakeMicrophone();
    const wakeWord = new FakeWakeWord();

    const engine = new VoiceEngine({ router, microphone, wakeWord, speechToText: stt, listenSeconds: 999 });
    engine.start();

    bus.publish(events.WAKE_DETECTED, {});
    microphone.emit("data", Buffer.from([1, 2, 3]));

    const errorEvents = [];
    const listener = data => errorEvents.push(data);
    bus.on(events.ERROR, listener);

    let result;
    try {
        await assert.doesNotReject(async () => { result = await engine.finishListening(); });
    } finally {
        bus.off(events.ERROR, listener);
    }

    assert.strictEqual(result, null);
    assert.strictEqual(errorEvents.length, 1);
    assert.ok(errorEvents[0].message.includes("real failure"));
    assert.strictEqual(router.calls.length, 0); // never reached the router
    assert.strictEqual(engine.status().state, "waiting"); // recovered, not stuck

    engine.stop();

});


test("VoiceEngine throws a clear error when constructed without a real router", () => {
    assert.throws(() => new VoiceEngine({}), /VoiceEngine requires a real core\/router Router instance/);
});


test("Requiring core/voice starts nothing automatically, and core/router remains fully usable independent of it", () => {

    const voice = require("../core/voice");

    // Merely requiring the voice layer (as this whole test file, and
    // potentially dashboard/backend/server.js in the future, does) must
    // never itself start a microphone, wake-word process, or engine --
    // real opt-in only via start().
    assert.strictEqual(voice.status().engineState, "idle");
    assert.strictEqual(voice.status().microphoneRunning, false);
    assert.strictEqual(voice.status().wakeWordRunning, false);

    // core/router -- the same class core/interface/terminal.js's real
    // "ask" command depends on -- is untouched and independently
    // constructible whether or not voice has ever been required.
    const Router = require("../core/router");
    assert.strictEqual(typeof Router, "function");

    // No listeners were left registered on the shared bus by any test
    // in this file -- every test above added and removed its own real
    // listener, so a voice failure/event can never silently leak into
    // an unrelated subsystem's own bus.on() handler.
    assert.strictEqual(bus.listenerCount(events.ERROR), 0);
    assert.strictEqual(bus.listenerCount(events.WAKE_DETECTED), 0);
    assert.strictEqual(bus.listenerCount(events.LISTENING), 0);

});
