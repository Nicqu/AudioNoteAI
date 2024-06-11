import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { uploadData, downloadData } from "aws-amplify/storage";
import { v4 as uuidv4 } from "uuid";

const client = generateClient<Schema>();

function App() {
  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
  const [file, setFile] = useState<File | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState("");

  useEffect(() => {
    client.models.Todo.observeQuery().subscribe({
      next: (data) => setTodos([...data.items]),
    });
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const generateFileName = (file: File): string => {
    const fileExtension = file.name.split(".").pop();
    const uuid = uuidv4();
    return `${uuid}.${fileExtension}`;
  };

  const uploadFile = async () => {
    if (file) {
      setIsLoading(true);
      setTranscription("");
      try {
        const newFileName = generateFileName(file);
        await uploadData({
          path: `audioFiles/${newFileName}`,
          data: file,
        }).result;
        console.log("Upload Succeeded");
        await pollTranscription(newFileName);
      } catch (error) {
        console.log("Upload Error: ", error);
        setIsLoading(false);
      }
    }
  };

  const pollTranscription = async (fileName: string) => {
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
          console.log("Download Succeeded: ", transcriptionKey);
        }
      } catch (error) {
        console.log(`Attempt ${attempts} failed: `, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!success) {
      console.log("Failed to retrieve transcription after maximum attempts.");
    }
    setIsLoading(false);
  };

  function createTodo() {
    client.models.Todo.create({ content: window.prompt("Todo content") });
  }

  function deleteTodo(id: string) {
    client.models.Todo.delete({ id });
  }

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <main>
          <h1>{user?.username}'s Transcriptions</h1>
          <button onClick={createTodo}>+ new</button>
          <ul>
            {todos.map((todo) => (
              <li onClick={() => deleteTodo(todo.id)} key={todo.id}>
                {todo.content}
              </li>
            ))}
          </ul>
          <div>
            <input type="file" onChange={handleChange} />
            <button onClick={uploadFile} disabled={isLoading}>
              Upload
            </button>
            {isLoading ? (
              <div>Loading...</div>
            ) : (
              <div>
                <h2>Transcription Content:</h2>
                <button onClick={() => navigator.clipboard.writeText(transcription)}>Copy to clipboard</button>
                <textarea value={transcription} readOnly rows={10} style={{ width: "100%", whiteSpace: "pre-wrap" }} />
              </div>
            )}
          </div>
          <button onClick={signOut}>Sign out</button>
        </main>
      )}
    </Authenticator>
  );
}

export default App;
