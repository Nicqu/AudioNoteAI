import { defineFunction, defineStorage } from "@aws-amplify/backend";

const whisperTranscribe = defineFunction({
  name: "whisperTranscribe",
  entry: "../functions/whisper-transcribe/handler.ts",
});

export const storage = defineStorage({
  name: "storage",
  access: (allow) => ({
    "audioFiles/*": [
      allow.authenticated.to(["read", "write", "delete"]),
      allow.guest.to(["read", "write", "delete"]),
      allow.resource(whisperTranscribe).to(["read", "write"]),
    ],
    // "audioFiles/{entity_id}/*": [
    //   allow.entity("identity").to(["read", "write", "delete"]),
    //   allow.authenticated.to(["read", "write", "delete"]),
    //   allow.resource(whisperTranscribe).to(["read"]),
    // ],
    "transcriptionFiles/*": [
      allow.authenticated.to(["read", "write", "delete"]),
      allow.guest.to(["read", "write", "delete"]),
      allow.resource(whisperTranscribe).to(["read", "write"]),
    ],
  }),
  triggers: {
    onUpload: whisperTranscribe,
  },
});
