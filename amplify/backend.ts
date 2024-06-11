import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { whisperTranscribe } from "./functions/whisper-transcribe/resource";
import { storage } from "./storage/resource";
import { Stack } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

const backend = defineBackend({
  auth,
  data,
  whisperTranscribe,
  storage,
});

const whisperTranscribeLambda = backend.whisperTranscribe.resources.lambda;

// Configure a policy for the Lambda function role
const statement = new iam.PolicyStatement({
  actions: ["transcribe:StartStreamTranscriptionWebSocket", "transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"],
  resources: ["*"],
});

// Configure a policy for the authenticated user IAM role
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(statement);
whisperTranscribeLambda.addToRolePolicy(statement);

// Adding predictions output
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
