import { S3Event, S3Handler } from "aws-lambda";
import * as AWS from "aws-sdk";

const s3 = new AWS.S3();

export const handler: S3Handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    // Ensure the file is in the 'audioFiles' directory
    if (!key.startsWith("audioFiles/")) {
      console.log(`Skipping file ${key} as it's not in the 'audioFiles' directory.`);
      continue;
    }

    // Replace 'audioFiles/' with 'transcriptionFiles/' and change the extension to '.txt'
    const newKey = key.replace("audioFiles/", "transcriptionFiles/").replace(/\.[^.]+$/, ".txt");

    try {
      const params = {
        Bucket: bucket,
        Key: newKey,
        Body: `${Date.now()}`,
      };

      await s3.putObject(params).promise();

      console.log(`Successfully created ${newKey} with timestamp`);
    } catch (error) {
      console.log(`Error creating file ${newKey}:`, error);
      throw error;
    }
  }
};
