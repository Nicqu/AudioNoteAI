import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Notifications from "aws-cdk-lib/aws-s3-notifications";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";

const backend = defineBackend({
  auth,
  data,
});

const customResourceStack = backend.createStack("MyCustomResources");

// Referenzieren Sie das vorhandene ECR-Repository
const repository = ecr.Repository.fromRepositoryAttributes(customResourceStack, "WhisperServiceRepository", {
  repositoryArn: "arn:aws:ecr:eu-central-1:851725442516:repository/whisper-asr-webservice",
  repositoryName: "whisper-asr-webservice",
});

// Erstellen der ersten Lambda-Funktion mit dem Docker-Image aus ECR
const whisperServiceLambda = new lambda.DockerImageFunction(customResourceStack, "WhisperServiceLambda", {
  code: lambda.DockerImageCode.fromEcr(repository, {
    tag: "latest",
  }),
  timeout: cdk.Duration.minutes(15),
  memorySize: 1024,
  environment: {
    PORT: "9000",
  },
});

// API Gateway zur Veröffentlichung des Endpunkts
const api = new apigateway.LambdaRestApi(customResourceStack, "WhisperServiceApi", {
  handler: whisperServiceLambda,
  proxy: false,
});

const transcribeResource = api.root.addResource("asr");
transcribeResource.addMethod("POST"); // POST /transcribe

// Erstellen der zweiten Lambda-Funktion, die durch S3-Ereignisse getriggert wird
const s3TriggeredLambda = new lambda.Function(customResourceStack, "S3TriggeredLambda", {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: "index.handler",
  code: lambda.Code.fromAsset("amplify/functions/s3-triggered-lambda"),
  timeout: cdk.Duration.minutes(15),
  memorySize: 1024,
  environment: {
    WHISPER_API_URL: api.url + "asr",
  },
});

// Erstellen Sie den S3-Bucket
const bucket = new s3.Bucket(customResourceStack, "CustomBucket", {
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});

// Fügen Sie eine S3-Ereignisbenachrichtigung zur zweiten Lambda-Funktion hinzu
bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3Notifications.LambdaDestination(s3TriggeredLambda), {
  prefix: "audioFiles/",
});

// Berechtigungen hinzufügen
bucket.grantReadWrite(s3TriggeredLambda);

// Exportieren Sie den Bucket-Namen und die API-URL als Output
backend.addOutput({
  storage: {
    aws_region: bucket.stack.region,
    bucket_name: bucket.bucketName,
  },
});

new cdk.CfnOutput(customResourceStack, "ApiUrlOutput", {
  value: api.url,
  exportName: "WhisperApiUrl",
});

// Berechtigungen für die Lambda-Funktion, um auf ECR zuzugreifen
whisperServiceLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"],
    resources: [repository.repositoryArn],
  })
);

// Berechtigungen hinzufügen, um die erste Lambda-Funktion aufzurufen
s3TriggeredLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["lambda:InvokeFunction"],
    resources: [whisperServiceLambda.functionArn],
  })
);
