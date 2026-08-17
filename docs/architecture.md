# Jarvis AI Architecture

## Pipeline

Microphone
    ?
Whisper Speech-to-Text
    ?
Intent Engine
    ?
    +-- Known command ? Command Handler
    ¦
    +-- General query ? Generative AI Engine
                         ?
                    Response text
                         ?
                  Text-to-Speech
                         ?
                      Speaker

All interactions are stored in SQLite.

## Components

### SpeechToText
Captures microphone audio and uses Whisper to transcribe speech.

### IntentEngine
Maps recognized text to application intents.

### CommandHandler
Executes deterministic local commands.

### AIEngine
Handles general conversational questions through an LLM when configured.

### TextToSpeech
Converts the generated response into spoken audio.

### Database
Stores timestamps, user text, intents and assistant responses.

## Design Principle

Deterministic commands are handled locally. General questions are routed to the Generative AI layer.
