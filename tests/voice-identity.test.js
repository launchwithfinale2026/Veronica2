const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");

const voiceIdentity = require("../core/voice/voiceIdentity");
const speechFormatter = require("../core/voice/speechFormatter");
const textToSpeech = require("../core/voice/textToSpeech");

class FakeChild extends EventEmitter {
    constructor(){
        super();
        this.stdout = new EventEmitter();
        this.stderr = new EventEmitter();
        this.stdin = { written: [], write(chunk){ this.written.push(chunk); }, end(){} };
        this.killed = false;
    }
    kill(){
        this.killed = true;
    }
}

// Supports both sync and async `fn` -- restores process.env only after
// a returned promise actually settles, not before (a plain
// try/finally around an async fn would restore env vars while the
// async body is still mid-flight).
function withEnv(overrides, fn){

    const original = { ...process.env };

    for(const [key, value] of Object.entries(overrides)){
        if(value === undefined){
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    const restore = () => { process.env = original; };

    let result;

    try {
        result = fn();
    } catch(error){
        restore();
        throw error;
    }

    if(result && typeof result.then === "function"){
        return result.finally(restore);
    }

    restore();
    return result;

}


// --- voiceIdentity.js (Task 1) -----------------------------------------

test("voiceIdentity.get() always identifies as VERONICA and returns the exact requested shape", () => {

    const identity = voiceIdentity.get();

    assert.strictEqual(identity.name, "VERONICA");
    assert.ok("voiceModel" in identity);
    assert.ok("speakingRate" in identity);
    assert.ok("pitch" in identity);
    assert.ok("style" in identity);

});


test("voiceIdentity.get() sources voiceModel from the real, already-configured Piper model path", () => {

    withEnv({ PIPER_MODEL: __filename, VOICE_PIPER_MODEL_PATH: undefined }, () => {
        assert.strictEqual(voiceIdentity.get().voiceModel, __filename);
    });

    withEnv({ PIPER_MODEL: undefined, PIPER_PATH: undefined, VOICE_PIPER_MODEL_PATH: undefined }, () => {
        assert.strictEqual(voiceIdentity.get().voiceModel, "");
    });

});


test("voiceIdentity.get() respects real env overrides for speakingRate/pitch/style, with sane defaults otherwise", () => {

    withEnv({ VOICE_SPEAKING_RATE: "1.3", VOICE_PITCH: "low", VOICE_STYLE: "warm" }, () => {
        const identity = voiceIdentity.get();
        assert.strictEqual(identity.speakingRate, "1.3");
        assert.strictEqual(identity.pitch, "low");
        assert.strictEqual(identity.style, "warm");
    });

    withEnv({ VOICE_SPEAKING_RATE: undefined, VOICE_PITCH: undefined, VOICE_STYLE: undefined }, () => {
        const identity = voiceIdentity.get();
        assert.strictEqual(identity.speakingRate, "1.0");
        assert.strictEqual(typeof identity.pitch, "string");
        assert.strictEqual(typeof identity.style, "string");
    });

});


test("voiceIdentity.js contains no hardcoded personality response text -- only vocal-characteristic values", () => {

    const fs = require("fs");
    const source = fs.readFileSync(require.resolve("../core/voice/voiceIdentity.js"), "utf8");

    // A real, direct check: no quoted greeting/personality-shaped
    // sentence literals in the module itself -- only configuration.
    assert.ok(!/["'`](Hello|Hi there|I'm VERONICA|How can I help)/i.test(source));

});


// --- speechFormatter.js (Task 3) -----------------------------------------

test("speechFormatter.format() turns real 'Label: value.' clauses into natural spoken phrasing, joined naturally", () => {

    const result = speechFormatter.format("Agent count: 9. Memory status: healthy. Event bus: active.");

    assert.strictEqual(
        result,
        "agent count is 9, memory status is healthy, and event bus is active."
    );

});


test("speechFormatter.format() preserves every real fact -- no value is altered or dropped", () => {

    const input = "Health score: 65. Status: degraded. Missing credentials: 8.";
    const result = speechFormatter.format(input);

    // Every real value from the input must still appear, verbatim, in
    // the output -- this is the "do not alter factual meaning, do not
    // invent information" guarantee, checked directly rather than
    // trusted.
    assert.ok(result.includes("65"));
    assert.ok(result.includes("degraded"));
    assert.ok(result.includes("8"));

});


test("speechFormatter.format() leaves a single clause with no 'Label:' shape untouched", () => {

    assert.strictEqual(speechFormatter.format("Everything is fine"), "Everything is fine.");

});


test("speechFormatter.format() handles empty/falsy input gracefully without throwing", () => {

    assert.strictEqual(speechFormatter.format(""), "");
    assert.strictEqual(speechFormatter.format(null), null);
    assert.strictEqual(speechFormatter.format(undefined), undefined);

});


test("speechFormatter.format() never invents an evaluative summary sentence not present in the input", () => {

    // Deliberate, documented scope limitation (see the module's own
    // header comment): the formatter must NOT prepend a fabricated
    // "All systems are healthy"-style sentence, even when every clause
    // happens to look positive -- only real clause-level rephrasing.
    const result = speechFormatter.format("Agent count: 9. Memory status: healthy. Event bus: active.");
    assert.ok(!result.toLowerCase().includes("all systems"));

});


// --- textToSpeech.js upgrades (Task 2) -----------------------------------

test("textToSpeech.speak() accepts a bare string (backward compatible) and the new { text, context } shape", async () => {

    await withEnv({ PIPER_PATH: __filename, PIPER_MODEL: __filename }, async () => {

        const children = [];
        const spawnFn = () => {
            const child = new FakeChild();
            children.push(child);
            return child;
        };

        const p1 = textToSpeech.speak("plain string response", { spawnFn, play: false });
        children[0].emit("exit", 0);
        const r1 = await p1;
        assert.strictEqual(r1.played, false);

        const p2 = textToSpeech.speak({ text: "object shape response", context: { agent: "system" } }, { spawnFn, play: false });
        children[1].emit("exit", 0);
        const r2 = await p2;
        assert.deepStrictEqual(r2.context, { agent: "system" });

    });

});


test("textToSpeech.speak() invokes Piper with the real configured model and voiceIdentity's real speakingRate as --length_scale", async () => {

    await withEnv({ PIPER_PATH: __filename, PIPER_MODEL: __filename, VOICE_SPEAKING_RATE: "1.4" }, async () => {

        let capturedArgs = null;
        let piperChild = null;

        const spawnFn = (command, args) => {
            capturedArgs = args;
            piperChild = new FakeChild();
            return piperChild;
        };

        const promise = textToSpeech.speak("test", { spawnFn, play: false });

        assert.ok(capturedArgs.includes("--model"));
        assert.strictEqual(capturedArgs[capturedArgs.indexOf("--model") + 1], __filename);
        assert.ok(capturedArgs.includes("--length_scale"));
        assert.strictEqual(capturedArgs[capturedArgs.indexOf("--length_scale") + 1], "1.4");

        // Let the fake Piper process "exit" cleanly so the promise
        // resolves and this test doesn't leak a dangling promise.
        piperChild.emit("exit", 0);
        await promise;

    });

});


test("textToSpeech.speak() fails safely with a clear error when unconfigured, never fabricating audio", async () => {

    await withEnv({ PIPER_PATH: undefined, PIPER_MODEL: undefined, VOICE_PIPER_BINARY_PATH: undefined, VOICE_PIPER_MODEL_PATH: undefined }, async () => {
        await assert.rejects(() => textToSpeech.speak("hello"), /Text-to-speech is not configured/);
    });

});


// --- Task 5 (Voice Interruption) plumbing in textToSpeech.js -------------

test("textToSpeech.isSpeaking()/stopPlayback() track and interrupt real playback, resolving speak() with interrupted:true", async () => {

    await withEnv({ PIPER_PATH: __filename, PIPER_MODEL: __filename }, async () => {

        let playerChild = null;
        let callCount = 0;

        const spawnFn = () => {

            callCount += 1;
            const child = new FakeChild();

            if(callCount === 1){
                // The Piper synthesis process -- exits immediately/cleanly.
                setImmediate(() => child.emit("exit", 0));
            } else {
                // The playback process -- this is the one interrupt()
                // should kill.
                playerChild = child;
            }

            return child;

        };

        assert.strictEqual(textToSpeech.isSpeaking(), false);

        const speakPromise = textToSpeech.speak("interrupt me", { spawnFn });

        // Wait for the Piper synthesis "exit" (setImmediate above) to
        // actually spawn the playback child before trying to interrupt
        // it.
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));

        assert.ok(playerChild, "playback child should have been spawned");
        assert.strictEqual(textToSpeech.isSpeaking(), true);

        const stopResult = textToSpeech.stopPlayback();
        assert.strictEqual(stopResult.stopped, true);
        assert.strictEqual(playerChild.killed, true);

        // A real kill() doesn't itself emit "exit" on this fake --
        // simulate the real OS behavior of the process actually exiting
        // after being killed.
        playerChild.emit("exit", null);

        const result = await speakPromise;
        assert.strictEqual(result.interrupted, true);
        assert.strictEqual(result.played, false);
        assert.strictEqual(textToSpeech.isSpeaking(), false);

    });

});


test("textToSpeech.stopPlayback() is a safe no-op when nothing is currently playing", () => {
    const result = textToSpeech.stopPlayback();
    assert.strictEqual(result.stopped, false);
});
