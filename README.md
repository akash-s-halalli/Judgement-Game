# Judgement - Virtual Card Game

This is a Next.js project for the card game "Judgement", designed to be played remotely with friends.

## Getting Started Locally

Follow these steps to set up and run the project on your local machine.

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm or yarn or pnpm

### 1. Clone or Download the Project

```bash
git clone <repository_url> # Replace <repository_url> with the actual URL
cd <project_directory_name>
```
Or download the source code as a ZIP file and extract it.

### 2. Set Up Environment Variables

This project requires environment variables for Firebase configuration and the Google AI API key.

*   Rename the `.env.local.example` file to `.env.local`.
*   Open `.env.local` and fill in the values with your actual Firebase project credentials and your Google Generative AI API key.

```env
# .env.local

# Firebase Configuration (Get these from your Firebase project settings)
NEXT_PUBLIC_FIREBASE_API_KEY="YOUR_API_KEY"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="YOUR_AUTH_DOMAIN"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="YOUR_STORAGE_BUCKET"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="YOUR_MESSAGING_SENDER_ID"
NEXT_PUBLIC_FIREBASE_APP_ID="YOUR_APP_ID"
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="YOUR_MEASUREMENT_ID" # Optional

# Google Generative AI API Key (For Genkit)
# Create one here: https://aistudio.google.com/app/apikey
GOOGLE_GENAI_API_KEY="YOUR_GOOGLE_GENAI_API_KEY"
```
**Important:** Keep your `.env.local` file secure and do not commit it to version control.

### 3. Install Dependencies

Install the necessary project dependencies using your preferred package manager:

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 4. Run the Development Server

Start the Next.js development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

The application should now be running, typically at `http://localhost:9002`. Open this URL in your browser.

**(Optional) Genkit Development:** If you are working on the AI features, you might need to run the Genkit development server in a separate terminal:

```bash
npm run genkit:dev
# or for watching changes:
npm run genkit:watch
```

### 5. Build for Production

To create an optimized production build:

```bash
npm run build
```

To run the production build locally:

```bash
npm run start
```

## How to Play (Brief Overview)

1.  Open the game in your browser.
2.  Enter your desired player name.
3.  **Create Game:** Starts a new game lobby and displays a unique room code.
4.  **Join Game:** Allows you to enter a room code provided by a friend to join their lobby.
5.  Once in the lobby, the host can see all joined players.
6.  The host can start the game when at least two players are present.
7.  (Game logic follows...)
