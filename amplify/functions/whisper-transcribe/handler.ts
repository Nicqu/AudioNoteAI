import { S3Event, S3Handler } from "aws-lambda";
import * as AWS from "aws-sdk";

const s3 = new AWS.S3();
const transcribe = new AWS.TranscribeService();

export const handler: S3Handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    // Ensure the file is in the 'audioFiles' directory
    if (!key.startsWith("audioFiles/")) {
      console.log(`Skipping file ${key} as it's not in the 'audioFiles' directory.`);
      continue;
    }

    try {
      // Get object metadata
      const headParams = {
        Bucket: bucket,
        Key: key,
      };
      const metadata = await s3.headObject(headParams).promise();
      console.log(`Metadata for file ${key}:`, metadata);
      const jobId = metadata.Metadata?.jobid;
      const transcriptionKey = metadata.Metadata?.transcriptionkey;

      if (!jobId) {
        console.log(`No jobId found for file ${key}`);
        continue;
      }
      if (!transcriptionKey) {
        console.log(`No transcriptionKey found for file ${key}`);
        continue;
      }

      const params: AWS.TranscribeService.StartTranscriptionJobRequest = {
        TranscriptionJobName: jobId,
        LanguageCode: "de-DE", // Specify the language code here
        Media: {
          MediaFileUri: `s3://${bucket}/${key}`,
        },
        OutputBucketName: bucket,
        OutputKey: transcriptionKey,
        Settings: {},
      };

      const data = await transcribe.startTranscriptionJob(params).promise();
      console.log(`Started transcription job for ${key}:`, data);
    } catch (error) {
      console.log(`Error processing file ${key}:`, error);
      throw error;
    }
  }
};
