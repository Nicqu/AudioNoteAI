import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { uploadData, downloadData } from "aws-amplify/storage";

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

  const uploadFile = async () => {
    if (file) {
      setIsLoading(true);
      setTranscription("");
      try {
        const result = await uploadData({
          path: `audioFiles/${file.name}`,
          data: file,
        }).result;
        console.log("Upload Succeeded: ", result);
        downloadFile(file.name);
      } catch (error) {
        console.log("Upload Error : ", error);
      }
    }
  };

  const downloadFile = async (fileName: string) => {
    const intervalId = setInterval(async () => {
      if (fileName) {
        try {
          const transcriptionFileKey = `transcriptionFiles/${fileName.replace(/\.[^/.]+$/, "")}.txt`;
          const downloadResult = await downloadData({
            path: transcriptionFileKey,
          }).result;
          const text = await downloadResult.body.text();
          // Alternatively, you can use `downloadResult.body.blob()`
          // or `downloadResult.body.json()` get read body in Blob or JSON format.
          console.log("Download Succeed: ", text);
          setTranscription(text);
          clearInterval(intervalId);
          setIsLoading(false);
        } catch (error) {
          console.log("Download Error : ", error);
        }
      }
    }, 5000); // Check every 5 seconds
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
          <h1>{user?.username}'s todos</h1>
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
            <button onClick={uploadFile}>Upload</button>
            {isLoading ? (
              <div>Loading...</div> // Replace this with your loading bar
            ) : (
              <div>
                <h2>Transcription Content:</h2>
                <pre>{transcription}</pre>
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
