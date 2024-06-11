import AWS from "aws-sdk";
import axios from "axios";
import fs from "fs";
import path from "path";

const s3 = new AWS.S3();

export const handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (!key.startsWith("audioFiles/")) {
      console.log(`Skipping file ${key} as it's not in the 'audioFiles' directory.`);
      continue;
    }

    const audioFile = await s3.getObject({ Bucket: bucket, Key: key }).promise();
    const audioFilePath = `/tmp/${path.basename(key)}`;
    fs.writeFileSync(audioFilePath, audioFile.Body);

    try {
      // eslint-disable-next-line no-undef
      const response = await axios.post(process.env.WHISPER_API_URL, {
        file: fs.createReadStream(audioFilePath)
      }, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const transcription = response.data.text;  // assuming the response contains 'text' field
      const newKey = key.replace("audioFiles/", "transcriptionFiles/").replace(/\.[^.]+$/, ".txt");

      await s3.putObject({
        Bucket: bucket,
        Key: newKey,
        Body: transcription,
      }).promise();

      console.log(`Successfully created ${newKey} with transcription`);
    } catch (error) {
      console.log(`Error transcribing file ${key}:`, error);
      throw error;
    }
  }
};
