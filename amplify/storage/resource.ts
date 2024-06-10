import { defineFunction, defineStorage } from "@aws-amplify/backend";

const whisperTranscribe = defineFunction({
  name: "whisperTranscribe",
  entry: "../functions/whisper-transcribe/handler.ts",
});

export const storage = defineStorage({
  name: "storage",
  access: (allow) => ({
    "audioFiles/*": [
      allow.authenticated.to(["read", "write"]),
      allow.guest.to(["read", "write"]),
      allow.resource(whisperTranscribe).to(["read", "write", "delete"]),
    ],
    "transcriptionFiles/*": [allow.authenticated.to(["read", "write"]), allow.resource(whisperTranscribe).to(["read", "write", "delete"])],
  }),
  triggers: {
    onUpload: whisperTranscribe,
  },
});
