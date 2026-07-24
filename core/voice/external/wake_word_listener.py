#!/usr/bin/env python3
"""
VERONICA -- openWakeWord reference listener (inference-only).

This is the reference implementation of the external-process contract
core/voice/wakeWord.js expects (see that file's and
core/voice/config.js's header comments). As of Phase 43 ("Ears"),
core/voice/microphone.js owns the real microphone in Node -- this
script does NOT open any audio device itself. It only ever:

  1. Reads raw 16kHz mono 16-bit signed PCM frames from STDIN (piped in
     by core/voice/voiceEngine.js via wakeWord.js's feed()).
  2. Runs a real wake-word model against each frame.
  3. On a real detection, prints exactly one bare line to STDOUT:

         WAKE

     and nothing else on stdout, ever -- all other output (startup
     messages, detection scores) goes to stderr, since
     core/voice/wakeWord.js only parses stdout and only reacts to a
     line matching "WAKE" exactly.

NOT executed or verified in the VERONICA repository's own environment --
this repo has no Python runtime and no openWakeWord installed. It is
written to match openWakeWord's real, documented API as closely as
possible, but treat it the same way this codebase treats any other
unconfigured connector: verify it actually works on your machine before
relying on it.

Setup (on the machine that will actually run this, not in this repo):
    pip install openwakeword numpy

The literal wake word "Veronica" is NOT one of openWakeWord's pretrained
models (those are alexa/hey_jarvis/hey_mycroft/etc.) -- a custom model
needs to be trained with openWakeWord's own training utility and pointed
at via --model (see docs/VOICE_SETUP.md). Any wake-word engine that
honors the same "print WAKE on detection" contract is a drop-in
replacement for this script -- core/voice/wakeWord.js does not depend
on openWakeWord specifically.

Usage:
    python3 wake_word_listener.py --model /path/to/veronica_model.onnx [--threshold 0.5]
"""

import argparse
import sys

import numpy as np
from openwakeword.model import Model

SAMPLE_RATE = 16000
FRAME_SAMPLES = 1280  # openWakeWord's documented default frame size
BYTES_PER_SAMPLE = 2  # 16-bit PCM


def read_exact(stream, num_bytes):
    """Reads exactly num_bytes from stdin's underlying binary buffer, or
    returns None at real end-of-stream (the mic process was stopped)."""

    data = b""

    while len(data) < num_bytes:

        chunk = stream.read(num_bytes - len(data))

        if not chunk:
            return None

        data += chunk

    return data


def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=False, help="Path to a custom openWakeWord model (.onnx/.tflite) -- required for a literal 'Veronica' wake word. Omit to use openWakeWord's default pretrained models.")
    parser.add_argument("--threshold", type=float, default=0.5, help="Detection confidence threshold (0-1).")
    args = parser.parse_args()

    model = Model(wakeword_models=[args.model] if args.model else None)

    frame_bytes = FRAME_SAMPLES * BYTES_PER_SAMPLE
    stdin = sys.stdin.buffer

    print("Listening on stdin for real microphone audio...", file=sys.stderr, flush=True)

    while True:

        raw = read_exact(stdin, frame_bytes)

        if raw is None:
            break  # stdin closed -- the mic process (or wakeWord.js) stopped feeding us

        audio_frame = np.frombuffer(raw, dtype=np.int16)

        predictions = model.predict(audio_frame)

        if any(score >= args.threshold for score in predictions.values()):

            print("Wake word detected", file=sys.stderr, flush=True)

            # The one line core/voice/wakeWord.js actually parses.
            print("WAKE", flush=True)


if __name__ == "__main__":
    main()
