import { startServer } from "./server";
import { ensureInitialized } from "./zhihu";

console.log("Initializing data store...");
ensureInitialized()
  .then(() => {
    console.log("Data store initialized.");
    startServer();
  })
  .catch(error => {
    console.error("Failed to initialize data store. Server not started.", error);
    process.exit(1);
  });
