import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { uploadData } from "aws-amplify/storage";
import { Predictions } from "@aws-amplify/predictions";

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
        startTranscription(file);
      } catch (error) {
        console.log("Upload Error: ", error);
      }
    }
  };

  const startTranscription = async (file: File) => {
    try {
      const result = await Predictions.convert({
        transcription: {
          source: {
            bytes: await file.arrayBuffer(),
          },
          language: "de-DE", // Specify the language code here
        },
      });
      console.log("Transcription Result: ", result.transcription.fullText);
      setTranscription(result.transcription.fullText);
      setIsLoading(false);
    } catch (error) {
      console.log("Transcription Error: ", error);
      setIsLoading(false);
    }
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
