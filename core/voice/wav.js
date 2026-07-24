// ==================================
// VERONICA VOICE -- WAV FILE ENCODING
// ==================================
//
// A minimal, dependency-free 16-bit PCM WAV writer. The raw audio
// microphone.js emits (see config.js's microphone() defaults: 16kHz
// mono 16-bit signed PCM -- exactly what whisper.cpp and openWakeWord
// both expect) needs a real WAV header before whisper.cpp can read it
// as a file; nothing this small and well-defined warranted a new npm
// dependency.

function encode(pcmBuffer, { sampleRate = 16000, channels = 1, bitDepth = 16 } = {}){

    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);
    const dataSize = pcmBuffer.length;

    const header = Buffer.alloc(44);

    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8, "ascii");
    header.write("fmt ", 12, "ascii");
    header.writeUInt32LE(16, 16); // fmt chunk size (PCM)
    header.writeUInt16LE(1, 20); // audio format: 1 = PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write("data", 36, "ascii");
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);

}

module.exports = { encode };
