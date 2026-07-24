#!/usr/bin/env python3
"""
VERONICA -- openWakeWord reference listener.

This is the reference implementation of the external-process contract
core/voice/wakeWord.js expects (see that file's and
core/voice/config.js's header comments): own the real microphone, run a
real wake-word model against it, and on each real detection print one
line to stdout:

    WAKE <absolute-path-to-a-recorded-utterance.wav>

NOT executed or verified in the VERONICA repository's own environment --
this repo has no Python runtime, no openWakeWord, and no microphone
access to test against. It is written to match openWakeWord's real,
documented API as closely as possible, but treat it the same way this
codebase treats any other unconfigured connector: verify it actually
works on your machine before relying on it, and adjust for whatever
openWakeWord/PyAudio API you actually have installed.

Setup (on the machine that will actually run this, not in this repo):
    pip install openwakeword pyaudio numpy

Usage:
    python3 wake_word_listener.py --model /path/to/model.onnx [--threshold 0.5]

Any wake-word engine that honors the same "print WAKE <path>" contract
is a drop-in replacement for this script -- core/voice/wakeWord.js does
not depend on openWakeWord specifically.
"""

import argparse
import sys
import tempfile
import time
import wave
import os

import numpy as np
import pyaudio
from openwakeword.model import Model

SAMPLE_RATE = 16000
CHUNK_SAMPLES = 1280  # openWakeWord's documented default frame size
UTTERANCE_SECONDS_AFTER_WAKE = 4
CHANNELS = 1
SAMPLE_WIDTH_BYTES = 2  # 16-bit PCM


def record_utterance(stream, seconds):
    """Records `seconds` of audio from an already-open PyAudio stream and
    writes it to a real temp WAV file, returning its path."""

    frames = []
    frames_needed = int(SAMPLE_RATE / CHUNK_SAMPLES * seconds)

    for _ in range(frames_needed):
        frames.append(stream.read(CHUNK_SAMPLES, exception_on_overflow=False))

    fd, path = tempfile.mkstemp(prefix="veronica-voice-", suffix=".wav")
    os.close(fd)

    with wave.open(path, "wb") as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(SAMPLE_WIDTH_BYTES)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(b"".join(frames))

    return path


def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=False, help="Path to a custom openWakeWord model (.onnx/.tflite). Omit to use openWakeWord's default pretrained models.")
    parser.add_argument("--threshold", type=float, default=0.5, help="Detection confidence threshold (0-1).")
    args = parser.parse_args()

    model = Model(wakeword_models=[args.model] if args.model else None)

    audio = pyaudio.PyAudio()
    stream = audio.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=CHUNK_SAMPLES
    )

    print("Listening for wake word...", file=sys.stderr, flush=True)

    try:

        while True:

            chunk = stream.read(CHUNK_SAMPLES, exception_on_overflow=False)
            audio_frame = np.frombuffer(chunk, dtype=np.int16)

            predictions = model.predict(audio_frame)

            triggered = any(score >= args.threshold for score in predictions.values())

            if triggered:

                print("Wake word detected -- recording utterance...", file=sys.stderr, flush=True)

                audio_path = record_utterance(stream, UTTERANCE_SECONDS_AFTER_WAKE)

                # The one line core/voice/wakeWord.js actually parses --
                # everything else on stderr is just for a human watching
                # the process directly.
                print(f"WAKE {audio_path}", flush=True)

                # Real, brief cooldown -- avoids re-triggering on the
                # tail of the utterance we just recorded.
                time.sleep(1)

    except KeyboardInterrupt:
        pass

    finally:
        stream.stop_stream()
        stream.close()
        audio.terminate()


if __name__ == "__main__":
    main()
