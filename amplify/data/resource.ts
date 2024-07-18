import { type ClientSchema, a, defineData, defineFunction } from "@aws-amplify/backend";

export const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";

export const generateMeetingNoteFunction = defineFunction({
  entry: "./generateMeetingNote.ts",
  environment: {
    MODEL_ID,
  },
  timeoutSeconds: 300,
});

const schema = a.schema({
  Job: a
    .model({
      id: a.string().required(),
      fileName: a.string(),
      status: a.string(),
      transcription: a.string(),
      results: a.string(),
      meetingNotes: a.string(),
      deleted: a.boolean(),
    })
    .authorization((allow) => [allow.owner()]),
  generateMeetingNote: a
    .query()
    .arguments({ prompt: a.string().required() })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(generateMeetingNoteFunction)),
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    // API Key is used for a.allow.public() rules
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
