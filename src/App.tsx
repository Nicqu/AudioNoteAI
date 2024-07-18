import React, { useState, useEffect, useCallback } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import { generateClient } from "aws-amplify/data";
import "@aws-amplify/ui-react/styles.css";
import { uploadData, downloadData, remove } from "aws-amplify/storage";
import { GiProcessor } from "react-icons/gi";
import { FaSignOutAlt, FaClipboard } from "react-icons/fa";
import { useDropzone } from "react-dropzone";
import { Hub } from "aws-amplify/utils";
import { getCurrentUser } from "aws-amplify/auth";
import type { Schema } from "../amplify/data/resource";

const client = generateClient<Schema>();

const MAX_DAILY_JOBS = 15;

const JOB_STATUS = {
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  UPLOADING: "Uploading",
};

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

interface SimplifiedTranscriptItem {
  speaker_label?: string;
  content: string;
}

interface SimplifiedTranscription {
  items: SimplifiedTranscriptItem[];
}

function App() {
  const [jobs, setJobs] = useState<Schema["Job"]["type"][]>([]);
  const [selectedJob, setSelectedJob] = useState<Schema["Job"]["type"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayJobsCount, setTodayJobsCount] = useState(MAX_DAILY_JOBS);
  const [isUserSignedIn, setIsUserSignedIn] = useState(false);

  const checkJobStatuses = useCallback(async (jobs: Schema["Job"]["type"][]) => {
    for (const job of jobs) {
      if (job.status === JOB_STATUS.PROCESSING) {
        await pollTranscription(job);
      }
    }
  }, []);

  const updateTodayJobsCount = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayJobs = jobs.filter((job) => new Date(job.createdAt || "") >= today);
    setTodayJobsCount(todayJobs.length);
  }, [jobs]);

  useEffect(() => {
    // Check if the user is already signed in when the component mounts
    getCurrentUser()
      .then(() => {
        setIsUserSignedIn(true);
      })
      .catch(() => {
        setIsUserSignedIn(false);
      });
  }, []);

  useEffect(() => {
    const fetchJobs = async () => {
      if (!isUserSignedIn) return;
      setLoading(true);
      try {
        const { data } = await client.models.Job.list();
        setJobs(data);
        await checkJobStatuses(data);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [checkJobStatuses, isUserSignedIn]);

  useEffect(() => {
    updateTodayJobsCount();
  }, [jobs, updateTodayJobsCount]);

  Hub.listen("auth", ({ payload }) => {
    switch (payload.event) {
      case "signedIn":
        setIsUserSignedIn(true);
        break;
      case "signedOut":
        setIsUserSignedIn(false);
        break;
    }
  });

  /**
   * Simplifies the transcription by combining consecutive words spoken by the same speaker.
   *
   * @param {TranscriptionResults} transcription - The original transcription results from the speech-to-text service.
   * @returns {SimplifiedTranscription} - The simplified transcription with combined speaker content.
   *
   * The function processes the transcription results and combines consecutive words spoken by the same speaker into single items.
   * Each item in the simplified transcription contains the speaker's label and the combined content.
   * This reduces the number of items and provides a more readable transcription.
   */
  const simplifyTranscription = (transcription: TranscriptionResults): SimplifiedTranscription => {
    const simplifiedItems: SimplifiedTranscriptItem[] = [];
    let currentSpeaker = "";
    let currentContent = "";

    transcription.results.items.forEach((item) => {
      const content = item.alternatives[0].content;

      if (item.speaker_label === currentSpeaker) {
        currentContent += " " + content;
      } else {
        if (currentSpeaker) {
          simplifiedItems.push({ speaker_label: currentSpeaker, content: currentContent });
        }
        currentSpeaker = item.speaker_label;
        currentContent = content;
      }
    });

    // Push the last speaker's content
    if (currentSpeaker) {
      simplifiedItems.push({ speaker_label: currentSpeaker, content: currentContent });
    }

    return { items: simplifiedItems };
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const audioFiles = acceptedFiles.filter((file) => file.type.startsWith("audio/"));

        if (audioFiles.length === 0) {
          alert("Please upload an audio file.");
          return;
        }

        // check if no more than 5 jobs created today
        if (todayJobsCount + audioFiles.length > MAX_DAILY_JOBS) {
          alert("You can only upload up to 5 files per day.");
          return;
        }

        try {
          await Promise.all(
            audioFiles.map(async (selectedFile) => {
              // Uploading
              console.log("Uploading");
              const { data, errors } = await client.models.Job.create({ fileName: selectedFile.name, status: JOB_STATUS.UPLOADING });
              if (errors || !data) {
                throw new Error("Failed to create the tender.");
              }

              // Update the state
              setJobs((prevJobs) => [...prevJobs, data]);

              await uploadData({
                path: ({ identityId }) => `audioFiles/${identityId}/${selectedFile.name}`,
                data: selectedFile,
                options: { metadata: { jobid: data.id, transcriptionkey: `transcriptionFiles/${data.id}.json` } },
              }).result;
              console.log("Upload Succeeded");

              // Polling
              await pollTranscription(data);
            })
          );
        } catch (error) {
          console.log("Upload Error: ", error);
        }
      }
    },
    [todayJobsCount]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 50_000_000, // 50 MB
  });

  async function updateJob(job: Schema["Job"]["type"]): Promise<void> {
    // Try updating the job
    try {
      const { data, errors } = await client.models.Job.update(job);
      if (errors || !data) {
        throw new Error("Failed to update the job.");
      }

      // Update the state
      setJobs((prevJobs) => prevJobs.map((j) => (j.id === job.id ? job : j)));
    } catch (error) {
      console.error("Failed to update the job: ", error);
    }
  }

  const pollTranscription = async (job: Schema["Job"]["type"]) => {
    // Processing
    job.status = JOB_STATUS.PROCESSING;

    await updateJob(job);

    // Update the state
    setSelectedJob((prevJob) => (prevJob?.id === job.id ? job : prevJob));

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
          const jsonData: TranscriptionResults = JSON.parse(json);
          const transcript = jsonData.results.transcripts.map((t) => t.transcript).join(" ");

          // Update the job with the transcription and results
          job.status = JOB_STATUS.COMPLETED;
          job.transcription = transcript;
          job.results = json;
          await updateJob(job);
          setSelectedJob((prevJob) => (prevJob?.id === job.id ? job : prevJob));

          //console.log("Download Succeeded: ", transcriptionKey);
          return; // Exit the loop on success
        }
      } catch (error) {
        console.log(`Attempt ${attempts} failed: `, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // If the loop completes without success, mark the job as failed
    job.status = JOB_STATUS.FAILED;
    await updateJob(job);

    console.log("Failed to retrieve transcription after maximum attempts.");
  };

  const handleJobClick = (job: Schema["Job"]["type"]) => {
    setSelectedJob(job);
  };

  const deleteJob = async (job: Schema["Job"]["type"]) => {
    try {
      job.deleted = true;
      await updateJob(job);

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

  const generateMeetingNotes = async (e: React.MouseEvent<HTMLButtonElement>, speakerDetection: boolean) => {
    e.preventDefault();
    console.log("Generating Meeting Notes");

    if (!selectedJob) {
      console.log("No job selected");
      return;
    }

    if (!selectedJob.transcription) {
      console.log("No transcription text found");
      return;
    }

    // Set the job to "Generating" while the notes are being generated
    let updatedJob = { ...selectedJob, status: JOB_STATUS.PROCESSING, meetingNotes: "Generating..." };
    setJobs((prevJobs) => prevJobs.map((job) => (job.id === selectedJob.id ? updatedJob : job)));
    setSelectedJob(updatedJob);

    try {
      let prompt = selectedJob.transcription;

      // use technical transcription for advanced notes
      if (speakerDetection) {
        const transcriptionResults = JSON.parse(selectedJob?.results || "") as TranscriptionResults;
        const simplifiedTranscription = selectedJob?.results ? simplifyTranscription(transcriptionResults) : null;
        prompt = JSON.stringify(simplifiedTranscription);
        if (!prompt) {
          throw new Error("No item found");
        }
      }

      const { data, errors } = await client.queries.generateMeetingNote({ prompt });

      if (errors) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error(errors.map((error: any) => error.message).join(", "));
      }

      if (data) {
        // Update the job with the meeting notes
        updatedJob = { ...selectedJob, status: JOB_STATUS.COMPLETED, meetingNotes: data };

        await updateJob(updatedJob);
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

  const confirmDeleteJob = (job: Schema["Job"]["type"]) => {
    if (window.confirm(`Are you sure you want to delete the job ${job.fileName}?`)) {
      deleteJob(job);
    }
  };

  return (
    <Authenticator hideSignUp>
      {({ signOut, user }) => (
        <main>
          <div className="header">
            <div className="header-left">
              <h1>
                <img src="logo.svg" alt="Logo" style={{ height: "30px", marginRight: "5px" }} />
                Audio Note AI
              </h1>
              <p style={{ marginTop: 0 }}>{user?.signInDetails?.loginId}&apos;s Transcriptions</p>
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
                {isDragActive ? (
                  <p>Drop the files here ...</p>
                ) : (
                  <p>
                    Drag&apos;n drop an audio file here, or click to select one.
                    <br />
                    Maximum file size 50MB.
                  </p>
                )}
              </div>
              <p style={{ margin: 0 }}>
                Daily Limit: {todayJobsCount} / {MAX_DAILY_JOBS}
              </p>
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
                          <div className="job-details">
                            {job.status === JOB_STATUS.PROCESSING && <img src="racoon-pedro.gif" alt="Processing" className="processing-gif" />}
                            <span>
                              [{job.status}] {job.fileName}
                            </span>
                            <div className="job-createdAt">{new Date(job?.createdAt ?? new Date()).toLocaleString()}</div>
                          </div>
                          <div className="job-buttons">
                            <button onClick={() => handleJobClick(job)} disabled={job.status === JOB_STATUS.PROCESSING} className="view-button">
                              VIEW
                            </button>
                            <button onClick={() => confirmDeleteJob(job)} className="delete-button" disabled={job.status === JOB_STATUS.PROCESSING}>
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
            <div className="generate-notes-buttons">
              <button
                onClick={(event) => generateMeetingNotes(event, false)}
                className="generate-notes-button"
                disabled={selectedJob?.status == JOB_STATUS.PROCESSING}
              >
                <GiProcessor /> Generate Meeting Notes
              </button>
              <button
                onClick={(event) => generateMeetingNotes(event, true)}
                className="generate-notes-button"
                disabled={selectedJob?.status == JOB_STATUS.PROCESSING}
              >
                <GiProcessor /> Generate Advanced Meeting Notes (with Speaker detetcion)
              </button>
            </div>
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
