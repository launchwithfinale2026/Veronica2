const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("node:events");

const bus = require("../core/bus");
const config = require("../core/voice/config");
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
        this.stdin = { write(){}, end(){} };
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


// --- config.js -----------------------------------------------------

test("config.status() reports real, evidence-based configured/missing state -- never assumed", () => {

    const originalEnv = { ...process.env };

    try {

        delete process.env.VOICE_WAKE_WORD_COMMAND;
        delete process.env.VOICE_WAKE_WORD_MODEL_PATH;
        delete process.env.VOICE_WHISPER_BINARY_PATH;
        delete process.env.VOICE_WHISPER_MODEL_PATH;
        delete process.env.VOICE_PIPER_BINARY_PATH;
        delete process.env.VOICE_PIPER_MODEL_PATH;

        const unconfigured = config.status();
        assert.strictEqual(unconfigured.wakeWord.configured, false);
        assert.strictEqual(unconfigured.speechToText.configured, false);
        assert.strictEqual(unconfigured.textToSpeech.configured, false);

        // A configured path that doesn't actually exist on disk must
        // NOT be reported as configured -- real fs.existsSync check,
        // not a truthy-string check.
        process.env.VOICE_WHISPER_BINARY_PATH = "/nonexistent/whisper-xqzvoice1";
        process.env.VOICE_WHISPER_MODEL_PATH = "/nonexistent/model-xqzvoice1.bin";
        assert.strictEqual(config.status().speechToText.configured, false);

        // A real, existing file (this test file itself) IS reported as
        // configured once both required fields point at real paths.
        process.env.VOICE_WHISPER_BINARY_PATH = __filename;
        process.env.VOICE_WHISPER_MODEL_PATH = __filename;
        assert.strictEqual(config.status().speechToText.configured, true);

    } finally {
        process.env = originalEnv;
    }

});


// --- wakeWord.js: voice event emission ------------------------------

test("WakeWordDetector publishes a real voice.wakeWordDetected bus event on a real WAKE line", () => {

    const { spawnFn, children } = fakeSpawnFactory();

    const originalEnv = { ...process.env };
    process.env.VOICE_WAKE_WORD_COMMAND = "fake-wake-word-listener";
    process.env.VOICE_WAKE_WORD_ARGS = "";
    delete process.env.VOICE_WAKE_WORD_MODEL_PATH;

    try {

        const detector = new WakeWordDetector({ spawnFn });
        detector.start();

        assert.strictEqual(children.length, 1);

        const captured = [];
        const listener = data => captured.push(data);
        bus.on("voice.wakeWordDetected", listener);

        try {
            children[0].stdout.emit("data", Buffer.from("WAKE /tmp/veronica-voice-xqz1.wav\n"));
        } finally {
            bus.off("voice.wakeWordDetected", listener);
        }

        assert.strictEqual(captured.length, 1);
        assert.strictEqual(captured[0].audioPath, "/tmp/veronica-voice-xqz1.wav");
        assert.ok(captured[0].detectedAt);

        detector.stop();

    } finally {
        process.env = originalEnv;
    }

});


test("WakeWordDetector buffers a real WAKE line split across multiple stdout chunks", () => {

    const { spawnFn, children } = fakeSpawnFactory();

    const originalEnv = { ...process.env };
    process.env.VOICE_WAKE_WORD_COMMAND = "fake-wake-word-listener";

    try {

        const detector = new WakeWordDetector({ spawnFn });
        detector.start();

        const captured = [];
        const listener = data => captured.push(data);
        bus.on("voice.wakeWordDetected", listener);

        try {
            children[0].stdout.emit("data", Buffer.from("WAKE /tmp/veronica-voice-"));
            children[0].stdout.emit("data", Buffer.from("xqz2.wav\n"));
        } finally {
            bus.off("voice.wakeWordDetected", listener);
        }

        assert.strictEqual(captured.length, 1);
        assert.strictEqual(captured[0].audioPath, "/tmp/veronica-voice-xqz2.wav");

        detector.stop();

    } finally {
        process.env = originalEnv;
    }

});


test("WakeWordDetector ignores real stdout noise that isn't a WAKE line", () => {

    const { spawnFn, children } = fakeSpawnFactory();

    const originalEnv = { ...process.env };
    process.env.VOICE_WAKE_WORD_COMMAND = "fake-wake-word-listener";

    try {

        const detector = new WakeWordDetector({ spawnFn });
        detector.start();

        const captured = [];
        const listener = data => captured.push(data);
        bus.on("voice.wakeWordDetected", listener);

        try {
            children[0].stdout.emit("data", Buffer.from("Listening for wake word...\n"));
        } finally {
            bus.off("voice.wakeWordDetected", listener);
        }

        assert.strictEqual(captured.length, 0);

        detector.stop();

    } finally {
        process.env = originalEnv;
    }

});


test("WakeWordDetector.start() throws a clear error when unconfigured, never fabricating a detection", () => {

    const originalEnv = { ...process.env };
    delete process.env.VOICE_WAKE_WORD_COMMAND;

    try {
        const detector = new WakeWordDetector({ spawnFn: () => new FakeChild() });
        assert.throws(() => detector.start(), /Wake word detection is not configured/);
    } finally {
        process.env = originalEnv;
    }

});


// --- voiceEngine.js: router receiving voice input + response to TTS -

function fakeRouter(responseText){
    return {
        calls: [],
        async route(text){
            this.calls.push(text);
            return {
                agent: "XQZ-Voice-Agent",
                result: {
                    cognition: {
                        response: { response: responseText, provider: "fake" }
                    }
                },
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
            return transcript;
        }
    };
}


test("VoiceEngine.handleUtterance() routes real transcribed text through the real core/router Router interface", async () => {

    const router = fakeRouter("XQZ real response text");
    const tts = fakeTextToSpeech();

    const engine = new VoiceEngine({ router, textToSpeech: tts });

    const result = await engine.handleUtterance("what is my schedule today");

    assert.deepStrictEqual(router.calls, ["what is my schedule today"]);
    assert.strictEqual(result.routed.agent, "XQZ-Voice-Agent");

});


test("VoiceEngine.handleUtterance() passes the router's real response text to the TTS layer", async () => {

    const router = fakeRouter("XQZ spoken-back response");
    const tts = fakeTextToSpeech();

    const engine = new VoiceEngine({ router, textToSpeech: tts });

    const result = await engine.handleUtterance("XQZ test utterance");

    assert.deepStrictEqual(tts.calls, ["XQZ spoken-back response"]);
    assert.strictEqual(result.spoken.played, true);

});


test("VoiceEngine.handleUtterance() publishes real voice.routed and voice.spoken bus events", async () => {

    const router = fakeRouter("XQZ bus event response");
    const tts = fakeTextToSpeech();
    const engine = new VoiceEngine({ router, textToSpeech: tts });

    const routedEvents = [];
    const spokenEvents = [];
    const onRouted = data => routedEvents.push(data);
    const onSpoken = data => spokenEvents.push(data);

    bus.on("voice.routed", onRouted);
    bus.on("voice.spoken", onSpoken);

    try {
        await engine.handleUtterance("XQZ event test utterance");
    } finally {
        bus.off("voice.routed", onRouted);
        bus.off("voice.spoken", onSpoken);
    }

    assert.strictEqual(routedEvents.length, 1);
    assert.strictEqual(routedEvents[0].responseText, "XQZ bus event response");

    assert.strictEqual(spokenEvents.length, 1);
    assert.strictEqual(spokenEvents[0].responseText, "XQZ bus event response");

});


test("VoiceEngine.handleWake() transcribes the real recorded audio, then routes and speaks it (full flow)", async () => {

    const router = fakeRouter("XQZ full-flow response");
    const tts = fakeTextToSpeech();
    const stt = fakeSpeechToText("XQZ transcribed utterance");

    const engine = new VoiceEngine({ router, textToSpeech: tts, speechToText: stt });

    const result = await engine.handleWake({ audioPath: "/tmp/veronica-voice-xqzfull.wav" });

    assert.deepStrictEqual(stt.calls, ["/tmp/veronica-voice-xqzfull.wav"]);
    assert.deepStrictEqual(router.calls, ["XQZ transcribed utterance"]);
    assert.deepStrictEqual(tts.calls, ["XQZ full-flow response"]);
    assert.strictEqual(result.spoken.played, true);

});


test("VoiceEngine.handleWake() does nothing when the wake event carries no recorded audio path", async () => {

    const router = fakeRouter("should never be called");
    const tts = fakeTextToSpeech();
    const stt = fakeSpeechToText("should never be called");

    const engine = new VoiceEngine({ router, textToSpeech: tts, speechToText: stt });

    const result = await engine.handleWake({ audioPath: null });

    assert.strictEqual(result, null);
    assert.strictEqual(router.calls.length, 0);
    assert.strictEqual(stt.calls.length, 0);

});


test("VoiceEngine.listen()/stopListening() wires and unwires the real bus event, driving the full flow end to end", async () => {

    const router = fakeRouter("XQZ listen-wired response");
    const tts = fakeTextToSpeech();
    const stt = fakeSpeechToText("XQZ listen-wired transcript");

    const engine = new VoiceEngine({ router, textToSpeech: tts, speechToText: stt });

    engine.listen();

    bus.publish("voice.wakeWordDetected", { audioPath: "/tmp/veronica-voice-xqzlisten.wav" });

    // handleWake() is async and fired from a bus listener with no
    // return value to await directly -- wait one microtask tick for the
    // real promise chain (transcribe -> route -> speak) to settle.
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    assert.deepStrictEqual(stt.calls, ["/tmp/veronica-voice-xqzlisten.wav"]);
    assert.deepStrictEqual(router.calls, ["XQZ listen-wired transcript"]);
    assert.deepStrictEqual(tts.calls, ["XQZ listen-wired response"]);

    engine.stopListening();

    bus.publish("voice.wakeWordDetected", { audioPath: "/tmp/veronica-voice-xqzlisten2.wav" });
    await new Promise(resolve => setImmediate(resolve));

    // Unwired -- the second publish must not trigger another call.
    assert.strictEqual(stt.calls.length, 1);

});


test("VoiceEngine throws a clear error when constructed without a real router", () => {
    assert.throws(() => new VoiceEngine({}), /VoiceEngine requires a real core\/router Router instance/);
});
