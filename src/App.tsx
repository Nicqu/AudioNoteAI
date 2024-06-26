import { useState, useEffect, useCallback } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import "@aws-amplify/ui-react/styles.css";
import { uploadData, downloadData, remove } from "aws-amplify/storage";
import { v4 as uuidv4 } from "uuid";
import { FaSignOutAlt, FaClipboard } from "react-icons/fa";
import { useDropzone } from "react-dropzone";

const client = generateClient<Schema>();

interface Alternative {
  confidence: string;
  content: string;
}

interface Item {
  start_time?: string;
  end_time?: string;
  alternatives: Alternative[];
  type: string;
  speaker_label: string;
}

interface Transcript {
  transcript: string;
}

interface Results {
  transcripts: Transcript[];
  items: Item[];
}

interface TranscriptionResults {
  jobName: string;
  accountId: string;
  results: Results;
  status: string;
}

type SimplifiedTranscriptItem = {
  speaker_label?: string;
  content: string;
};

type SimplifiedTranscription = {
  items: SimplifiedTranscriptItem[];
};

type Job = {
  id: string;
  fileName: string;
  status: string;
  transcription?: string;
  results?: string;
  meetingNotes?: string;
  deleted?: boolean;
  createdAt?: string;
};

const JOB_STATUS = {
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  const checkJobStatuses = useCallback(async (jobs: Job[]) => {
    for (const job of jobs) {
      if (job.status === JOB_STATUS.PROCESSING) {
        await pollTranscription(job);
      }
    }
  }, []);

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      try {
        const { data } = await client.models.Job.list();
        const formattedJobs: Job[] = data.map((job) => ({
          id: job.id!,
          fileName: job.fileName!,
          status: job.status!,
          transcription: job.transcription!,
          meetingNotes: job.meetingNotes!,
          deleted: job.deleted!,
          createdAt: job.createdAt!,
        }));
        setJobs(formattedJobs);
        console.log("Jobs: ", formattedJobs);
        await checkJobStatuses(formattedJobs);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [checkJobStatuses]);

  function simplifyTranscription(transcription: TranscriptionResults): SimplifiedTranscription {
    const simplifiedItems = transcription.results.items.map((item) => {
      const content = item.alternatives[0].content;
      return {
        speaker_label: item.speaker_label,
        content,
      };
    });

    return {
      items: simplifiedItems,
    };
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const audioFiles = acceptedFiles.filter((file) => file.type.startsWith("audio/"));

        if (audioFiles.length === 0) {
          alert("Please upload an audio file.");
          return;
        }

        // check if no more than 5 jobs created today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayJobs = jobs.filter((job) => new Date(job.createdAt || "") >= today);
        if (todayJobs.length + audioFiles.length > 5) {
          alert("You can only upload up to 5 files per day.");
          return;
        }

        try {
          await Promise.all(
            audioFiles.map(async (selectedFile) => {
              // Uploading
              const jobId = uuidv4();
              console.log("Uploading");
              const newJob = { id: jobId, fileName: selectedFile.name, status: "Uploading" };
              await client.models.Job.create(newJob);
              setJobs((prevJobs) => [...prevJobs, newJob]);

              await uploadData({
                path: ({ identityId }) => `audioFiles/${identityId}/${selectedFile.name}`,
                data: selectedFile,
                options: { metadata: { jobid: jobId, transcriptionkey: `transcriptionFiles/${jobId}.json` } },
              }).result;
              console.log("Upload Succeeded");

              // Polling
              await pollTranscription(newJob);
            })
          );
        } catch (error) {
          console.log("Upload Error: ", error);
        }
      }
    },
    [jobs]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
  });

  const pollTranscription = async (job: Job) => {
    // Processing
    const updatedJob = { ...job, status: JOB_STATUS.PROCESSING };
    await client.models.Job.update(updatedJob);
    setJobs((prevJobs) => prevJobs.map((j) => (j.id === job.id ? updatedJob : j)));
    setSelectedJob((prevJob) => (prevJob?.id === job.id ? updatedJob : prevJob));

    const transcriptionKey = `transcriptionFiles/${job.id}.json`;
    //console.log("transcriptionKey: ", transcriptionKey);

    const maxAttempts = 50;
    const delay = 15000; // 15 seconds delay between attempts
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const downloadResult = await downloadData({ path: transcriptionKey }).result;
        if (downloadResult) {
          const json = await downloadResult.body.text();
          const data: TranscriptionResults = JSON.parse(json);
          const transcript = data.results.transcripts.map((t) => t.transcript).join(" ");

          // Update the job with the transcription and results
          const updatedJob = { ...job, status: JOB_STATUS.COMPLETED, transcription: transcript, results: json };
          await client.models.Job.update(updatedJob);
          setJobs((prevJobs) => prevJobs.map((j) => (j.id === job.id ? updatedJob : j)));
          setSelectedJob((prevJob) => (prevJob?.id === job.id ? updatedJob : prevJob));

          //console.log("Download Succeeded: ", transcriptionKey);
          return; // Exit the loop on success
        }
      } catch (error) {
        console.log(`Attempt ${attempts} failed: `, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // If the loop completes without success, mark the job as failed
    const failedJob = { ...job, status: JOB_STATUS.FAILED };
    await client.models.Job.update(failedJob);
    setJobs((prevJobs) => prevJobs.map((j) => (j.id === job.id ? failedJob : j)));

    console.log("Failed to retrieve transcription after maximum attempts.");
  };

  const handleJobClick = (job: Job) => {
    setSelectedJob(job);
  };

  const deleteJob = async (job: Job) => {
    try {
      await client.models.Job.update({ id: job.id, deleted: true });
      setJobs((prevJobs) => prevJobs.filter((j) => j.id !== job.id));

      if (selectedJob?.id === job.id) {
        setSelectedJob(null);
      }

      await Promise.all([
        remove({ path: ({ identityId }) => `audioFiles/${identityId}/${job.fileName}` }),
        remove({ path: `transcriptionFiles/${job.id}.json` }),
      ]);

      console.log(`Successfully deleted job ${job.id}`);
    } catch (error) {
      console.log(`Error deleting job ${job.id}:`, error);
    }
  };

  const generateMeetingNotes = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    console.log("Generating Meeting Notes");

    if (!selectedJob) {
      console.log("No job selected");
      return;
    }

    if (selectedJob.meetingNotes) {
      console.log("Meeting Notes already exist: ", selectedJob.meetingNotes);
      return;
    }

    // Set the job to "Generating" while the notes are being generated
    let updatedJob = { ...selectedJob, status: JOB_STATUS.PROCESSING, meetingNotes: "Generating..." };
    setJobs((prevJobs) => prevJobs.map((job) => (job.id === selectedJob.id ? updatedJob : job)));
    setSelectedJob(updatedJob);

    try {
      const transcriptionResults = JSON.parse(selectedJob?.results || "") as TranscriptionResults;
      const simplifiedTranscription = selectedJob?.results ? simplifyTranscription(transcriptionResults) : null;
      const item = JSON.stringify(simplifiedTranscription);

      if (!item) {
        throw new Error("No item found");
      }

      const { data, errors } = await client.queries.generateMeetingNote({
        prompt: item || "",
      });

      if (errors) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error(errors.map((error: any) => error.message).join(", "));
      }

      if (data) {
        // Update the job with the meeting notes
        updatedJob = { ...selectedJob, status: JOB_STATUS.COMPLETED, meetingNotes: data };
        await client.models.Job.update(updatedJob);
        setJobs((prevJobs) => prevJobs.map((job) => (job.id === selectedJob.id ? updatedJob : job)));
        setSelectedJob(updatedJob);
      }
    } catch (err) {
      let errorMessage = "An error occurred while generating notes";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      }
      console.log("Error generating meeting notes: ", errorMessage);
      alert("Error generating meeting notes: " + errorMessage);
      updatedJob = { ...selectedJob, status: JOB_STATUS.FAILED, meetingNotes: "" };
      setJobs((prevJobs) => prevJobs.map((job) => (job.id === selectedJob.id ? updatedJob : job)));
      setSelectedJob(updatedJob);
    }
  };

  const confirmDeleteJob = (job: Job) => {
    if (window.confirm(`Are you sure you want to delete the job ${job.fileName}?`)) {
      deleteJob(job);
    }
  };

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <main>
          <div className="header">
            <div className="header-left">
              <h1>
                <img src="logo.svg" alt="Logo" style={{ height: "30px", marginRight: "5px" }} />
                Audio Note AI
              </h1>
              <p style={{ marginTop: 0 }}>{user?.signInDetails?.loginId}'s Transcriptions</p>
            </div>
            <button onClick={signOut} className="signout-button" title="Sign out">
              <FaSignOutAlt />
            </button>
          </div>
          <div className="container">
            <h2>Upload Audio</h2>
            <div className="upload-section">
              <div {...getRootProps({ className: "dropzone" })}>
                <input {...getInputProps()} />
                {isDragActive ? <p>Drop the files here ...</p> : <p>Drag 'n' drop an audio file here, or click to select one</p>}
              </div>
            </div>
          </div>
          <div className="container">
            <h2>Audio Files</h2>
            {loading ? (
              <div className="loading-indicator">Loading...</div>
            ) : (
              jobs.filter((job) => !job.deleted).length !== 0 && (
                <ul>
                  {jobs
                    .filter((job) => !job.deleted)
                    .map((job) => (
                      <li key={job.id} className={`job-item ${selectedJob?.id === job.id ? "selected-job" : ""}`}>
                        <div className="job-details-container">
                          <span className="job-details">
                            {job.status == JOB_STATUS.PROCESSING && <img src="racoon-pedro.gif" alt="Processing" className="processing-gif" />}
                            {job.fileName} - {job.status}
                          </span>
                          <div className="job-buttons">
                            <button onClick={() => handleJobClick(job)} disabled={job.status == JOB_STATUS.PROCESSING} className="view-button">
                              VIEW
                            </button>
                            <button onClick={() => confirmDeleteJob(job)} className="delete-button" disabled={job.status == JOB_STATUS.PROCESSING}>
                              DELETE
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              )
            )}
          </div>
          <div className="container">
            <div className="transcription-header">
              <h2>Transcription</h2>
              <button onClick={() => navigator.clipboard.writeText(selectedJob?.transcription ?? "")} className="copy-button" title="Copy to clipboard">
                <FaClipboard />
              </button>
            </div>
            <textarea value={selectedJob?.transcription ?? ""} readOnly rows={10} className="transcription-textarea" />
          </div>
          <div className="container">
            <button
              onClick={generateMeetingNotes}
              className="generate-notes-button"
              disabled={selectedJob?.status == JOB_STATUS.PROCESSING || (selectedJob?.meetingNotes?.length ?? 0) > 0}
            >
              Generate Meeting Notes
            </button>
          </div>
          <div className="container">
            <div className="transcription-header">
              <h2>Meeting Notes</h2>
              <button onClick={() => navigator.clipboard.writeText(selectedJob?.meetingNotes ?? "")} className="copy-button" title="Copy to clipboard">
                <FaClipboard />
              </button>
            </div>
            <textarea value={selectedJob?.meetingNotes ?? ""} readOnly rows={10} className="transcription-textarea" />
          </div>
          <footer className="footer">
            <p>Made for 🍸</p>
          </footer>
        </main>
      )}
    </Authenticator>
  );
}

export default App;
