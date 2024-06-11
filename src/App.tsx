import { useState, useEffect } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import "@aws-amplify/ui-react/styles.css";
import { uploadData, downloadData } from "aws-amplify/storage";
import { v4 as uuidv4 } from "uuid";

const client = generateClient<Schema>();

type Job = {
  id: string;
  fileName: string;
  status: string;
};

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [file, setFile] = useState<File | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState("");

  useEffect(() => {
    const fetchJobs = async () => {
      const { data } = await client.models.Job.list();
      setJobs(data);
      await checkJobStatuses(data);
    };

    fetchJobs();
  }, []);

  const checkJobStatuses = async (jobs: Job[]) => {
    for (const job of jobs) {
      if (job.status === "Processing") {
        await pollTranscription(job.fileName, job.id);
      }
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const selectedFile = event.target.files[0];
      if (selectedFile.type.startsWith("audio/")) {
        setFile(selectedFile);
      } else {
        alert("Please upload an audio file.");
      }
    }
  };

  const generateFileName = (file: File): string => {
    // const fileExtension = file.name.split(".").pop();
    // const uuid = uuidv4();
    // return `${uuid}.${fileExtension}`;
    //const timestamp = new Date().getTime();
    //return `${timestamp}_${file.name.replace(/[^a-zA-Z0-9-_.!*'()/]/g, "_")}`;
    return `${file.name.replace(/[^a-zA-Z0-9-_.!*'()/]/g, "_")}`;
  };

  const uploadFile = async () => {
    if (file) {
      setIsLoading(true);
      setTranscription("");
      try {
        const newFileName = generateFileName(file);
        const jobId = uuidv4();
        const newJob = { id: jobId, fileName: newFileName, status: "Uploading" };

        await client.models.Job.create(newJob);

        setJobs((prevJobs) => [...prevJobs, newJob]);

        await uploadData({
          path: `audioFiles/${newFileName}`,
          data: file,
        }).result;

        console.log("Upload Succeeded");

        await client.models.Job.update({
          id: jobId,
          status: "Processing",
        });

        setJobs((prevJobs) => prevJobs.map((job) => (job.id === jobId ? { ...job, status: "Processing" } : job)));

        await pollTranscription(newFileName, jobId);
      } catch (error) {
        console.log("Upload Error: ", error);
        setIsLoading(false);
      }
    }
  };

  const pollTranscription = async (fileName: string, jobId: string) => {
    const transcriptionFileName = fileName.replace(/\.[^.]+$/, ".json");
    const transcriptionKey = `transcriptionFiles/${transcriptionFileName}`;
    console.log("transcriptionKey: ", transcriptionKey);

    const maxAttempts = 50;
    const delay = 15000; // 15 seconds delay between attempts
    let attempts = 0;
    let success = false;

    while (attempts < maxAttempts && !success) {
      try {
        attempts++;
        const downloadResult = await downloadData({
          path: transcriptionKey,
        }).result;
        if (downloadResult) {
          console.log("Result: ", downloadResult);
          const json = await downloadResult.body.text();
          const data = JSON.parse(json);
          const transcript = (data.results.transcripts as Array<{ transcript: string }>).map((t) => t.transcript).join(" ");
          setTranscription(transcript);
          success = true;

          await client.models.Job.update({
            id: jobId,
            status: "Completed",
          });

          setJobs((prevJobs) => prevJobs.map((job) => (job.id === jobId ? { ...job, status: "Completed" } : job)));

          console.log("Download Succeeded: ", transcriptionKey);
        }
      } catch (error) {
        console.log(`Attempt ${attempts} failed: `, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!success) {
      await client.models.Job.update({
        id: jobId,
        status: "Failed",
      });

      setJobs((prevJobs) => prevJobs.map((job) => (job.id === jobId ? { ...job, status: "Failed" } : job)));
      console.log("Failed to retrieve transcription after maximum attempts.");
    }
    setIsLoading(false);
  };

  const handleJobClick = async (fileName: string) => {
    setIsLoading(true);
    const transcriptionFileName = fileName.replace(/\.[^.]+$/, ".json");
    const transcriptionKey = `transcriptionFiles/${transcriptionFileName}`;
    try {
      const downloadResult = await downloadData({
        path: transcriptionKey,
      }).result;
      if (downloadResult) {
        const json = await downloadResult.body.text();
        const data = JSON.parse(json);
        const transcript = (data.results.transcripts as Array<{ transcript: string }>).map((t) => t.transcript).join(" ");
        setTranscription(transcript);
        console.log("Download Succeeded: ", transcriptionKey);
      }
    } catch (error) {
      console.log("Error retrieving transcription: ", error);
    }
    setIsLoading(false);
  };

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <main>
          <h1>{user?.username}'s Transcriptions</h1>
          <div>
            <input type="file" accept="audio/*" onChange={handleChange} />
            <button onClick={uploadFile} disabled={isLoading}>
              Upload
            </button>
          </div>
          <ul>
            {jobs.map((job) => (
              <li key={job.id} onClick={() => handleJobClick(job.fileName)}>
                {job.fileName} - {job.status}
              </li>
            ))}
          </ul>
          <div>
            <h2>Transcription Content:</h2>
            <button onClick={() => navigator.clipboard.writeText(transcription)}>Copy to clipboard</button>
            <textarea value={transcription} readOnly rows={10} style={{ width: "100%", whiteSpace: "pre-wrap" }} />
          </div>
          <button onClick={signOut}>Sign out</button>
        </main>
      )}
    </Authenticator>
  );
}

export default App;
