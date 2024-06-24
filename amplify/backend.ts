import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data, MODEL_ID, generateMeetingNoteFunction } from "./data/resource";
import { awsTranscribe } from "./functions/awstranscribe/resource";
import { storage } from "./storage/resource";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

const backend = defineBackend({
  auth,
  data,
  awsTranscribe,
  storage,
  generateMeetingNoteFunction,
});

backend.awsTranscribe.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["transcribe:StartStreamTranscriptionWebSocket", "transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"],
    resources: ["*"],
  })
);

backend.generateMeetingNoteFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["bedrock:InvokeModel"],
    resources: [`arn:aws:bedrock:*::foundation-model/${MODEL_ID}`],
  })
);

export default backend;
