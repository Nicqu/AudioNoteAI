import { defineFunction } from "@aws-amplify/backend";

export const whisperTranscribe = defineFunction({
  // optionally specify a name for the Function (defaults to directory name)
  name: "whisper-transcribe",
  // optionally specify a path to your handler (defaults to "./handler.ts")
  entry: "./handler.ts",
});
