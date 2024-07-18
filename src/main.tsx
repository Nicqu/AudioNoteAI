import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);

const rootContainer = document.getElementById("root") as HTMLElement;
ReactDOM.createRoot(rootContainer).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
