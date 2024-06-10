import { defineFunction, defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "audioStorage",
  access: (allow) => ({
    "audioTranscribtions/{entity_id}/*": [allow.guest.to(["read"]), allow.entity("identity").to(["read", "write", "delete"])],
    "audioFiles/*": [allow.authenticated.to(["read", "write"]), allow.guest.to(["read", "write"])],
  }),
  triggers: {
    onUpload: defineFunction({
      entry: "../functions/whisper-transcribe/handler.ts",
    }),
  },
});
