# Gemini Project Context: Multimodal Live API Web Console

This project is a React-based starter application designed to demonstrate the capabilities of the [Gemini Multimodal Live API](https://ai.google.dev/api/multimodal-live) using WebSockets for real-time interaction.

## Project Overview

-   **Purpose:** Provides a boilerplate for building real-time AI applications with audio, video, and text streaming.
-   **Architecture:**
    -   **Websocket Client (`GenAILiveClient`):** A custom event-emitting class in `src/lib/genai-live-client.ts` that wraps the `@google/genai` Live API for low-level connection management.
    -   **React Hook (`useLiveAPI`):** Located in `src/hooks/use-live-api.ts`, this hook manages the client instance, connection lifecycle, and audio streaming (both in and out).
    -   **Context Provider (`LiveAPIContext`):** Located in `src/contexts/LiveAPIContext.tsx`, it exposes the `useLiveAPI` functionality to the entire component tree.
    -   **UI Components:**
        -   `SidePanel`: Displays session logs and allows for basic configuration.
        -   `ControlTray`: Manages user inputs like microphone, webcam, and screen capture.
        -   `Altair`: Demonstrates tool-calling by rendering Vega-Lite graphs.
        -   `Logger`: Shows detailed protocol-level messages for debugging.

## Tech Stack

-   **Frontend:** React 18 with TypeScript.
-   **State Management:** Zustand (used in `store-logger.ts`) and React Context.
-   **Styling:** SCSS with BEM-like naming conventions in some areas.
-   **Communication:** WebSockets via the GenAI Live SDK and `eventemitter3`.
-   **Audio/Video:** Web Audio API (with Worklets in `src/lib/worklets`) and MediaStreams.
-   **Visualization:** `vega`, `vega-lite`, and `vega-embed`.

## Building and Running

### Prerequisites

-   Node.js and npm installed.
-   A Gemini API Key (obtain from [Google AI Studio](https://aistudio.google.com/apikey)).

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env` file in the root directory and add your API key:

```env
REACT_APP_GEMINI_API_KEY=your_api_key_here
```

### Key Scripts

-   `npm start`: Runs the app in development mode at `http://localhost:3000`.
-   `npm run start-https`: Runs the app with HTTPS (useful for some browser media permissions).
-   `npm run build`: Bundles the application for production.
-   `npm test`: Executes the test suite (uses Jest).

## Development Conventions

-   **Types:** All domain-specific types should be defined in `src/types.ts` or close to their usage if specific to a component.
-   **Hooks:** Use custom hooks (e.g., `useWebcam`, `useScreenCapture`, `useMediaStreamMux`) to encapsulate browser API logic.
-   **Real-time Logic:**
    -   The `GenAILiveClient` emits events like `audio`, `content`, `toolcall`, and `log`.
    -   Audio processing is handled via `AudioWorklet` for low latency. PCM16 16kHz is the standard format used by the API.
-   **Tool Calling:** The `Altair` component serves as the primary example for implementing custom tool handlers. It listens for `toolcall` events from the client and renders visualizations accordingly.
-   **Logging:** A centralized logging system is available via `src/lib/store-logger.ts` and the `Logger` component to track all client-server communication.
