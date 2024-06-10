import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { whisperTranscribe } from "./functions/whisper-transcribe/resource";
import { storage } from "./storage/resource";

defineBackend({
  auth,
  data,
  whisperTranscribe,
  storage,
});
