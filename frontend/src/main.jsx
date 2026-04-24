import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// index.css is imported in App.jsx so it is always loaded exactly once.

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
