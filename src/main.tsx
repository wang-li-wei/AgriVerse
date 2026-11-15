import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
// Drei Html owns nested DOM roots; avoid development effect replay on those roots.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
