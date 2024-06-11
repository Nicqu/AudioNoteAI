import { defineFunction, defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "storage",
  access: (allow) => ({
    "audioFiles/*": [allow.authenticated.to(["read", "write"]), allow.guest.to(["read", "write"])],
    "transcriptionFiles/*": [allow.authenticated.to(["read", "write"])],
  }),
});
