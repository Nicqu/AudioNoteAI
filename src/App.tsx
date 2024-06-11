import { useState, useEffect } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import "@aws-amplify/ui-react/styles.css";
import { uploadData, downloadData, remove } from "aws-amplify/storage";
import { v4 as uuidv4 } from "uuid";
import { FaSignOutAlt, FaClipboard } from "react-icons/fa";

const client = generateClient<Schema>();

type Job = {
  id: string;
  fileName: string;
  status: string;
};

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [file, setFile] = useState<File | undefined>();
  const [isUploading, setIsUploading] = useState(false);
  const [transcription, setTranscription] = useState("");

  useEffect(() => {
    const fetchJobs = async () => {
      const { data } = await client.models.Job.list();
      const formattedJobs: Job[] = data.map((job) => ({
        id: job.id!,
        fileName: job.fileName!,
        status: job.status!,
      }));
      setJobs(formattedJobs);
      await checkJobStatuses(formattedJobs);
    };

    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkJobStatuses = async (jobs: Job[]) => {
    for (const job of jobs) {
      if (job.status === "Processing") {
        await pollTranscription(job.id);
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

  const uploadFile = async () => {
    if (file) {
      setIsUploading(true);
      setTranscription("");
      try {
        const jobId = uuidv4();
        const newJob = { id: jobId, fileName: file.name, status: "Uploading" };
        await client.models.Job.create(newJob);
        setJobs((prevJobs) => [...prevJobs, newJob]);

        await uploadData({
          path: ({ identityId }) => `audioFiles/${identityId}/${file.name}`,
          data: file,
          options: { metadata: { jobid: jobId, transcriptionkey: `transcriptionFiles/${jobId}.json` } },
        }).result;
        console.log("Upload Succeeded");

        await client.models.Job.update({
          id: jobId,
          status: "Processing",
        });
        setJobs((prevJobs) => prevJobs.map((job) => (job.id === jobId ? { ...job, status: "Processing" } : job)));

        await pollTranscription(jobId);
      } catch (error) {
        console.log("Upload Error: ", error);
      }
      setIsUploading(false);
    }
  };

  const pollTranscription = async (jobId: string) => {
    const transcriptionKey = `transcriptionFiles/${jobId}.json`;
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
  };

  const handleJobClick = async (jobId: string) => {
    const transcriptionKey = `transcriptionFiles/${jobId}.json`;
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
  };

  const deleteJob = async (jobId: string, fileName: string) => {
    try {
      // Delete job from database
      await client.models.Job.delete({ id: jobId });
      setJobs((prevJobs) => prevJobs.filter((job) => job.id !== jobId));

      // Delete audio file
      await remove({ path: ({ identityId }) => `audioFiles/${identityId}/${fileName}` });

      // Delete transcription file
      await remove({ path: `transcriptionFiles/${jobId}.json` });
    } catch (error) {
      console.log(`Error deleting job ${jobId}:`, error);
    }
  };

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <main>
          <div className="header">
            <h1>{user?.signInDetails?.loginId}'s Transcriptions</h1>
            <button onClick={signOut} className="signout-button" title="Sign out">
              <FaSignOutAlt />
            </button>
          </div>
          <div className="upload-section">
            <input type="file" accept="audio/*" onChange={handleChange} />
            <button onClick={uploadFile} disabled={isUploading}>
              Upload
            </button>
          </div>
          <h2>Transcription Jobs:</h2>
          <ul>
            {jobs.map((job) => (
              <li key={job.id} className="job-item">
                <span onClick={() => handleJobClick(job.id)} className="job-details">
                  {job.fileName} - {job.status}
                </span>
                <button onClick={() => deleteJob(job.id, job.fileName)} className="delete-button">
                  &#x1f5d1;
                </button>
              </li>
            ))}
          </ul>
          <div>
            <h2>Transcription:</h2>
            <div className="transcription-container">
              <textarea value={transcription} readOnly rows={10} className="transcription-textarea" />
              <button onClick={() => navigator.clipboard.writeText(transcription)} className="copy-button" title="Copy to clipboard">
                <FaClipboard />
              </button>
            </div>
          </div>
        </main>
      )}
    </Authenticator>
  );
}

export default App;
