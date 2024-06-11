import { S3Event, S3Handler } from "aws-lambda";
import * as AWS from "aws-sdk";

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

    // Define the transcription job name and output key
    const jobName = `transcription-${Date.now()}`;
    const outputKey = key.replace("audioFiles/", "transcriptionFiles/").replace(/\.[^.]+$/, ".json");

    const params: AWS.TranscribeService.StartTranscriptionJobRequest = {
      TranscriptionJobName: jobName,
      LanguageCode: "de-DE", // Specify the language code here
      Media: {
        MediaFileUri: `s3://${bucket}/${key}`,
      },
      OutputBucketName: bucket,
      OutputKey: outputKey,
      Settings: {},
    };

    try {
      const data = await transcribe.startTranscriptionJob(params).promise();
      console.log(`Started transcription job for ${key}:`, data);
    } catch (error) {
      console.log(`Error starting transcription job for ${key}:`, error);
      throw error;
    }
  }
};
