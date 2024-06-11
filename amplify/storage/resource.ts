import { defineStorage } from "@aws-amplify/backend";
import { awsTranscribe } from "../functions/awstranscribe/resource";

export const storage = defineStorage({
  name: "storage",
  access: (allow) => ({
    "audioFiles/{entity_id}/*": [allow.entity("identity").to(["read", "write", "delete"]), allow.resource(awsTranscribe).to(["read", "write"])],
    "transcriptionFiles/*": [allow.authenticated.to(["read", "write", "delete"]), allow.resource(awsTranscribe).to(["read", "write"])],
  }),
  triggers: {
    onUpload: awsTranscribe,
  },
});
