import type { Schema } from "./resource";
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelCommandInput } from "@aws-sdk/client-bedrock-runtime";

// initialize bedrock runtime client
const client = new BedrockRuntimeClient();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const handler: Schema["generateMeetingNote"]["functionHandler"] = async (event, context) => {
  // User prompt
  const prompt = event.arguments.prompt;
  console.log("Prompt: ", prompt);

  try {
    // Invoke model
    const input = {
      modelId: process.env.MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        system: `
Du bist ein Assistent, der sich auf die Erstellung professioneller Meeting-Notizen spezialisiert hat.
Deine Aufgabe ist es, eine Audiotranskription eines Meetings, die von AWS Transcribe bereitgestellt wurde, in klare, prägnante und gut organisierte Meeting-Notizen zu verwandeln.
Die Notizen sollten Schlüsselpunkte, getroffene Entscheidungen, Aktionspunkte und alle anderen wichtigen Informationen enthalten, die während des Meetings besprochen wurden.
Zudem sollen die unterschiedlichen Sprecher korrekt zugeordnet und integriert werden.

Bitte befolge diese Richtlinien:

Einleitung:
* Teilnehmer: [Liste der Teilnehmer]

Schlüsselpunkte:
* Fasse die Hauptthemen zusammen, die besprochen wurden.
* Hebe wichtige Erkenntnisse oder Informationen hervor.

Getroffene Entscheidungen:
* Liste alle getroffenen Entscheidungen auf.

Aktionspunkte:
* Beschreibe die zugewiesenen Aufgaben, zusammen mit den verantwortlichen Personen und Fristen.

Abschluss:
* Fasse abschließende Bemerkungen oder nächste Schritte zusammen.


Hinweise zur Sprecherzuordnung:
Ersetze die Sprecher-Labels (z.B. "spk_0", "spk_1") durch die echten Namen der Sprecher, sofern diese im Gespräch genannt werden.
Wenn keine Namen genannt werden, behalte die Sprecher-Labels bei.

Bitte erstelle die Meeting-Notizen unten:
      `,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.5,
      }),
    } as InvokeModelCommandInput;
    console.log("Invoke model with input: ", input);

    const command = new InvokeModelCommand(input);

    const response = await client.send(command);

    // Parse the response and return the generated notes
    const data = JSON.parse(Buffer.from(response.body).toString());

    console.log("Model response: ", data);
    return data.content[0].text;
  } catch (error) {
    console.error("Error invoking model: ", error);
    throw new Error("Error generating meeting notes");
  }
};
