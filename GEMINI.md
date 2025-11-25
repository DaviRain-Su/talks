# Project Overview

This is a web application that fetches and displays comments from a Zhihu question. It is built with Bun, React, and Tailwind CSS.

The application has a frontend and a backend. The backend is a Bun server that fetches data from the Zhihu API, caches it, and provides it to the frontend via a REST API. The frontend is a React application that displays the comments in a user-friendly interface.

## Building and Running

### Installation

To install the dependencies, run:

```bash
bun install
```

### Development

To start the development server with hot reloading, run:

```bash
bun dev
```

The application will be available at `http://localhost:3000`.

### Production

To build the application for production, run:

```bash
bun run build
```

This will create a `dist` directory with the optimized and minified assets.

To run the application in production mode, use:

```bash
bun start
```

## Development Conventions

### Tech Stack

- **Runtime:** [Bun](https://bun.sh/)
- **Frontend:** [React](https://react.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)

### Project Structure

- `src/`: Contains the source code for the application.
  - `index.ts`: The entry point for the Bun server.
  - `frontend.tsx`: The entry point for the React application.
  - `App.tsx`: The main React component.
  - `ZhihuComments.tsx`: The component that displays the Zhihu comments.
  - `index.html`: The main HTML file.
  - `index.css`: The main CSS file.
- `build.ts`: The build script for the project.
- `data/`: Contains data files, such as the cached Zhihu comments and configuration.
- `dist/`: Contains the production build of the application.

### API Endpoints

- `GET /api/zhihu/comments`: Returns the cached Zhihu comments.
- `POST /api/zhihu/refresh`: Triggers a refresh of the Zhihu comments from the Zhihu API.
