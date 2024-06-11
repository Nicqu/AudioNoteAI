import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { whisperTranscribe } from "./functions/whisper-transcribe/resource";
import { storage } from "./storage/resource";
import { Stack } from "aws-cdk-lib";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

const backend = defineBackend({
  auth,
  data,
  whisperTranscribe,
  storage,
});

// Configure a policy for the required use case.
// The actions included below cover all supported ML capabilities
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: ["transcribe:StartStreamTranscriptionWebSocket", "transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"],
    resources: ["*"],
  })
);

backend.addOutput({
  custom: {
    Predictions: {
      convert: {
        transcription: {
          defaults: {
            language: "de-DE",
          },
          proxy: false,
          region: Stack.of(backend.auth.resources.authenticatedUserIamRole).region,
        },
      },
    },
  },
});

export default backend;
