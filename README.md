# AI-Canvas-Reminder
<sub>I put off doing homework for this.</sub>

### This program retreives upcoming assignments from the Canvas API, turns them into a reminder in natural language with GPT3.5 and sends them to your devices with a push notification.

## Requirements
- NodeJS 16 or higher.
- An openai API key.
- A pushover licence for your device. (or free trial)
- A Canvas instance set up by your school.

## Running
```
git clone https://github.com/PixelMelt/AI-Canvas-Reminder
cd ./AI-Canvas-Reminder
npm i
node index.js
```

<br>

### Feel free to open up an issue if you want to see a feature implemented, I really dont mind.
<br>

## Configuration
- OPENAI_API_KEY: The authentication key required to access OpenAI's API.
- CANVAS_API_KEY: An authentication key from your Canvas account. (Generated in https://\<schoolname\>.instructure.com/profile/settings under "Approved Integrations")

- CANVAS_BASE_URL: The base URL endpoint for your schools Canvas API.

- EXCLUDED_COURSES: A list of course IDs to be excluded from processing by the application.

- PUSHOVER_USER and PUSHOVER_TOKEN: Authentication keys for using the Pushover notification service.

- REAL_NAME: The student's actual name.

- PRIVACY_NAME: A privacy-friendly name to replace the actual name when prompting GPT 3.5.

- GENTLE_REMINDER_PROMPT and NOT_SO_GENTLE_REMINDER_PROMPT: Templates for generating reminder messages using the OpenAI API. These contain placeholders for the student's name and the current date that get inserted when the program is run.