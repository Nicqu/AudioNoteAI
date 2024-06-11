import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { awsTranscribe } from "./functions/awstranscribe/resource";
import { storage } from "./storage/resource";
import * as iam from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";

const backend = defineBackend({
  auth,
  data,
  awsTranscribe,
  storage,
});

// eslint-disable-next-line @typescript-eslint/ban-types
const awsTranscribeLambda = backend.awsTranscribe.resources.lambda as Function;

// Configure a policy for the Lambda function role
const statement = new iam.PolicyStatement({
  actions: ["transcribe:StartStreamTranscriptionWebSocket", "transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"],
  resources: ["*"],
});

// Configure a policy for the authenticated user IAM role
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(statement);
awsTranscribeLambda.addToRolePolicy(statement);

export default backend;
