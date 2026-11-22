import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { startMarketingPerformance } from "./lib/marketingPerformance";

void startMarketingPerformance();
createRoot(document.getElementById("root")!).render(<App />);
