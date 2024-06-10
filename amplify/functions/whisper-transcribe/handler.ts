import { S3Event, S3Handler } from "aws-lambda";
import * as AWS from "aws-sdk";

const s3 = new AWS.S3();

export const handler: S3Handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const newKey = key.replace(/\.[^/.]+$/, ".txt");

    try {
      const params = {
        Bucket: bucket,
        CopySource: `${bucket}/${key}`,
        Key: newKey,
      };

      await s3.copyObject(params).promise();

      if (newKey !== key) {
        await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
      }

      console.log(`Successfully renamed ${key} to ${newKey}`);
    } catch (error) {
      console.log(`Error renaming file ${key}:`, error);
      throw error;
    }
  }
};
